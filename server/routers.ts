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
          const imageKey = await uploadImageToLark(buffer, img.name);
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
          imageMap: z.record(z.string(), z.string()).optional(), // src -> imageKey
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

        // 4. Parse content to blocks
        const imgMap = input.imageMap
          ? new Map<string, string>(Object.entries(input.imageMap) as [string, string][])
          : undefined;
        const blocks =
          input.contentType === "markdown"
            ? markdownToLarkBlocks(input.content, imgMap)
            : htmlToLarkBlocks(input.content, imgMap);

        // 5. Add blocks in batches (Lark API has limits)
        const BATCH_SIZE = 5;
        for (let i = 0; i < blocks.length; i += BATCH_SIZE) {
          const batch = blocks.slice(i, i + BATCH_SIZE);
          await addDocxBlocks(objToken, batch, i);
          // Small delay to avoid rate limiting
          if (i + BATCH_SIZE < blocks.length) {
            await new Promise((resolve) => setTimeout(resolve, 200));
          }
        }

        // 6. Construct the wiki URL for the new page
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
