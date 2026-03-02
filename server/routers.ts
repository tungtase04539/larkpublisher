import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import {
  parseWikiUrl,
  getWikiNodeInfo,
  createWikiNode,
  addDocxBlocks,
  updateDocxBlock,
  uploadImageToLark,
} from "./larkApi";
import {
  markdownToLarkBlocks,
  htmlToLarkBlocks,
  extractImageReferences,
  extractImageReferencesFromHtml,
} from "./contentParser";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  wiki: router({
    /**
     * Validate a Wiki URL and return node info
     */
    validateUrl: publicProcedure
      .input(z.object({ url: z.string().url() }))
      .mutation(async ({ input }) => {
        const { nodeToken } = parseWikiUrl(input.url);
        const nodeInfo = await getWikiNodeInfo(nodeToken);
        return {
          nodeToken,
          spaceId: nodeInfo.space_id,
          title: nodeInfo.title,
          objToken: nodeInfo.obj_token,
          objType: nodeInfo.obj_type,
          hasChild: nodeInfo.has_child,
        };
      }),

    /**
     * Upload images to Lark and return image keys
     */
    uploadImages: publicProcedure
      .input(
        z.object({
          docToken: z.string(), // document obj_token for image upload target
          images: z.array(
            z.object({
              name: z.string(),
              data: z.string(), // base64 encoded
            })
          ),
        })
      )
      .mutation(async ({ input }) => {
        const results: { name: string; imageKey: string }[] = [];
        for (const img of input.images) {
          const buffer = Buffer.from(img.data, "base64");
          const imageKey = await uploadImageToLark(buffer, img.name, input.docToken);
          results.push({ name: img.name, imageKey });
        }
        return results;
      }),

    /**
     * Parse content and preview blocks (without publishing)
     */
    preview: publicProcedure
      .input(
        z.object({
          content: z.string(),
          contentType: z.enum(["markdown", "html"]),
        })
      )
      .mutation(({ input }) => {
        const blocks =
          input.contentType === "markdown"
            ? markdownToLarkBlocks(input.content)
            : htmlToLarkBlocks(input.content);

        const imageRefs =
          input.contentType === "markdown"
            ? extractImageReferences(input.content)
            : extractImageReferencesFromHtml(input.content);

        return { blocks, imageRefs, blockCount: blocks.length };
      }),

    /**
     * Publish content to Lark Wiki
     */
    publish: publicProcedure
      .input(
        z.object({
          wikiUrl: z.string(),
          title: z.string().min(1),
          content: z.string(),
          contentType: z.enum(["markdown", "html"]),
          imageMap: z.record(z.string(), z.string()).optional(), // src -> imageKey (pre-uploaded)
          images: z.array(
            z.object({
              name: z.string(),
              data: z.string(), // base64 encoded
            })
          ).optional(), // images to upload after doc creation
        })
      )
      .mutation(async ({ input }) => {
        // 1. Parse wiki URL
        const { nodeToken } = parseWikiUrl(input.wikiUrl);

        // 2. Get parent node info
        const nodeInfo = await getWikiNodeInfo(nodeToken);
        const spaceId = nodeInfo.space_id;

        // 3. Create new wiki node
        const { nodeToken: newNodeToken, objToken } = await createWikiNode(
          spaceId,
          nodeToken,
          input.title
        );

        // 4. Build a map of image name -> raw data (don't upload yet)
        const imageDataMap = new Map<string, Buffer>();
        if (input.images && input.images.length > 0) {
          for (const img of input.images) {
            imageDataMap.set(img.name, Buffer.from(img.data, "base64"));
          }
        }

        console.log(`[Publish] Raw images available: ${imageDataMap.size}`);

        // 5. Build image ref -> filename mapping (content src -> uploaded filename)
        const refToFilename = new Map<string, string>();
        if (imageDataMap.size > 0) {
          const imageRefs =
            input.contentType === "markdown"
              ? extractImageReferences(input.content)
              : extractImageReferencesFromHtml(input.content);

          for (const ref of imageRefs) {
            // Direct match
            if (imageDataMap.has(ref)) {
              refToFilename.set(ref, ref);
              continue;
            }
            // Try basename match
            const refBasename = ref.split("/").pop()?.split("?")[0] || "";
            for (const name of Array.from(imageDataMap.keys())) {
              if (name === refBasename || ref.endsWith(name)) {
                refToFilename.set(ref, name);
                break;
              }
            }
          }
          console.log(`[Publish] Image ref matches:`, Array.from(refToFilename.entries()));
        }

        // Create a dummy imgMap so blocks are generated with image placeholders
        // (the token value will be used to identify which image data to upload later)
        const imgMap = new Map<string, string>();
        for (const [ref, filename] of Array.from(refToFilename.entries())) {
          imgMap.set(ref, `__placeholder__${filename}`);
        }

        // 6. Parse content to blocks (image blocks will have placeholder tokens)
        const blocks =
          input.contentType === "markdown"
            ? markdownToLarkBlocks(input.content, imgMap.size > 0 ? imgMap : undefined)
            : htmlToLarkBlocks(input.content, imgMap.size > 0 ? imgMap : undefined);

        console.log(`[Publish] Generated ${blocks.length} blocks, image blocks: ${blocks.filter(b => b.block_type === 27).length}`);

        // 7. Add blocks in batches
        // Image blocks are sent as empty placeholders, then uploaded+patched after
        const BATCH_SIZE = 3;
        let failedBatches = 0;
        for (let i = 0; i < blocks.length; i += BATCH_SIZE) {
          const batch = blocks.slice(i, i + BATCH_SIZE);

          // Track which blocks in this batch are image placeholders
          const imageInfoInBatch: { indexInBatch: number; filename: string }[] = [];
          const sanitizedBatch = batch.map((block, idx) => {
            if (block.block_type === 27 && block.image?.token?.startsWith("__placeholder__")) {
              const filename = block.image.token.replace("__placeholder__", "");
              imageInfoInBatch.push({ indexInBatch: idx, filename });
              return { block_type: 27, image: {} };
            }
            return block;
          });

          let created: { block_id: string; block_type: number }[];
          try {
            created = await addDocxBlocks(objToken, sanitizedBatch, i);
          } catch (err: any) {
            console.warn(`[Publish] Batch ${i}-${i + batch.length} failed: ${err.message}. Trying one-by-one...`);
            // Retry blocks individually
            created = [];
            for (let j = 0; j < sanitizedBatch.length; j++) {
              try {
                const single = await addDocxBlocks(objToken, [sanitizedBatch[j]], i + j);
                created.push(single[0]);
              } catch (e2: any) {
                console.warn(`[Publish] Block ${i + j} (type ${sanitizedBatch[j].block_type}) skipped: ${e2.message}`);
                created.push({ block_id: "", block_type: 0 });
                failedBatches++;
              }
            }
          }

          // For each image placeholder: upload image with block_id as parent_node, then PATCH
          for (const info of imageInfoInBatch) {
            const createdBlock = created[info.indexInBatch];
            if (!createdBlock || !createdBlock.block_id || createdBlock.block_type !== 27) continue;

            const imgBuffer = imageDataMap.get(info.filename);
            if (!imgBuffer) {
              console.warn(`[Publish] No image data for "${info.filename}", skipping`);
              continue;
            }

            // Upload with parent_node = block_id (NOT doc_token!)
            console.log(`[Publish] Uploading "${info.filename}" with parent_node=${createdBlock.block_id}`);
            try {
              const fileToken = await uploadImageToLark(imgBuffer, info.filename, createdBlock.block_id);
              console.log(`[Publish] Uploaded -> fileToken: ${fileToken}`);

              // PATCH the block with the file_token
              await updateDocxBlock(objToken, createdBlock.block_id, {
                replace_image: { token: fileToken },
              });
              console.log(`[Publish] Patched image block ${createdBlock.block_id}`);
            } catch (imgErr: any) {
              console.warn(`[Publish] Image "${info.filename}" failed: ${imgErr.message}`);
            }
          }

          // Small delay to avoid rate limiting
          if (i + BATCH_SIZE < blocks.length) {
            await new Promise((resolve) => setTimeout(resolve, 300));
          }
        }

        if (failedBatches > 0) {
          console.warn(`[Publish] ${failedBatches} blocks skipped due to errors`);
        }

        // 7. Construct the wiki URL for the new page
        const baseUrl = input.wikiUrl.match(
          /(https?:\/\/[^/]+)/
        )?.[1] || "https://congdongagi.sg.larksuite.com";
        const newWikiUrl = `${baseUrl}/wiki/${newNodeToken}`;

        return {
          success: true,
          nodeToken: newNodeToken,
          objToken,
          wikiUrl: newWikiUrl,
          blocksPublished: blocks.length,
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
