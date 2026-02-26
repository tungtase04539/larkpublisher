import { useState, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Upload,
  FileText,
  Image as ImageIcon,
  Link2,
  Send,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
  Trash2,
  BookOpen,
  ArrowRight,
  Sparkles,
} from "lucide-react";

type PublishStep = "idle" | "validating" | "uploading-images" | "publishing" | "done" | "error";

export default function Home() {
  const [wikiUrl, setWikiUrl] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [contentType, setContentType] = useState<"markdown" | "html">("markdown");
  const [images, setImages] = useState<{ name: string; data: string; file: File }[]>([]);
  const [fileName, setFileName] = useState("");
  const [publishStep, setPublishStep] = useState<PublishStep>("idle");
  const [progress, setProgress] = useState(0);
  const [resultUrl, setResultUrl] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [wikiInfo, setWikiInfo] = useState<{ title: string; spaceId: string; nodeToken: string } | null>(null);
  const [previewData, setPreviewData] = useState<{ blockCount: number; imageRefs: string[] } | null>(null);

  const validateUrl = trpc.wiki.validateUrl.useMutation();
  const uploadImages = trpc.wiki.uploadImages.useMutation();
  const previewMutation = trpc.wiki.preview.useMutation();
  const publishMutation = trpc.wiki.publish.useMutation();

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setContent(text);
      setFileName(file.name);
      if (file.name.endsWith(".html") || file.name.endsWith(".htm")) {
        setContentType("html");
      } else {
        setContentType("markdown");
      }
      if (!title) {
        const nameWithoutExt = file.name.replace(/\.(md|markdown|html|htm)$/i, "");
        setTitle(nameWithoutExt);
      }
      toast.success(`Đã tải file: ${file.name}`);
    };
    reader.readAsText(file);
  }, [title]);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = (ev.target?.result as string).split(",")[1];
        setImages((prev) => [...prev, { name: file.name, data: base64, file }]);
      };
      reader.readAsDataURL(file);
    });
    toast.success(`Đã thêm ${files.length} ảnh`);
  }, []);

  const removeImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleValidateUrl = useCallback(async () => {
    if (!wikiUrl) { toast.error("Vui lòng nhập đường link Wiki"); return; }
    try {
      const result = await validateUrl.mutateAsync({ url: wikiUrl });
      setWikiInfo({ title: result.title, spaceId: result.spaceId, nodeToken: result.nodeToken });
      toast.success(`Wiki hợp lệ: "${result.title}"`);
    } catch (err: any) {
      toast.error(err.message || "Không thể xác thực Wiki URL");
      setWikiInfo(null);
    }
  }, [wikiUrl, validateUrl]);

  const handlePreview = useCallback(async () => {
    if (!content) { toast.error("Vui lòng tải file nội dung trước"); return; }
    try {
      const result = await previewMutation.mutateAsync({ content, contentType });
      setPreviewData({ blockCount: result.blockCount, imageRefs: result.imageRefs });
      toast.success(`Phân tích: ${result.blockCount} blocks, ${result.imageRefs.length} ảnh`);
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi phân tích nội dung");
    }
  }, [content, contentType, previewMutation]);

  const handlePublish = useCallback(async () => {
    if (!wikiUrl || !title || !content) { toast.error("Vui lòng điền đầy đủ thông tin"); return; }
    setPublishStep("validating"); setProgress(10); setErrorMsg("");
    try {
      await validateUrl.mutateAsync({ url: wikiUrl });
      setProgress(25);
      let imageMap: Record<string, string> = {};
      if (images.length > 0) {
        setPublishStep("uploading-images"); setProgress(40);
        const uploadResult = await uploadImages.mutateAsync({ images: images.map((img) => ({ name: img.name, data: img.data })) });
        uploadResult.forEach((r) => { imageMap[r.name] = r.imageKey; });
        setProgress(60);
      }
      setPublishStep("publishing"); setProgress(75);
      const result = await publishMutation.mutateAsync({ wikiUrl, title, content, contentType, imageMap: Object.keys(imageMap).length > 0 ? imageMap : undefined });
      setProgress(100); setPublishStep("done"); setResultUrl(result.wikiUrl);
      toast.success("Đã đẩy bài viết thành công lên Lark Wiki!");
    } catch (err: any) {
      setPublishStep("error"); setErrorMsg(err.message || "Đã xảy ra lỗi khi đẩy bài viết");
      toast.error(err.message || "Lỗi khi publish");
    }
  }, [wikiUrl, title, content, contentType, images, validateUrl, uploadImages, publishMutation]);

  const handleReset = useCallback(() => {
    setPublishStep("idle"); setProgress(0); setResultUrl(""); setErrorMsg("");
  }, []);

  const isPublishing = publishStep !== "idle" && publishStep !== "done" && publishStep !== "error";
  const stepLabels: Record<PublishStep, string> = useMemo(() => ({
    idle: "", validating: "Đang xác thực Wiki URL...", "uploading-images": "Đang tải ảnh lên Lark...",
    publishing: "Đang đẩy nội dung lên Wiki...", done: "Hoàn thành!", error: "Đã xảy ra lỗi",
  }), []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20">
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">Lark Wiki Publisher</h1>
              <p className="text-xs text-slate-500">Đẩy nội dung MD/HTML lên Lark Wiki</p>
            </div>
          </div>
          <Badge variant="secondary" className="text-xs"><Sparkles className="w-3 h-3 mr-1" />Powered by Lark API</Badge>
        </div>
      </header>

      <main className="container py-8 max-w-4xl">
        <div className="space-y-6">
          {/* Step 1: Wiki URL */}
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold">1</div>
                <div>
                  <CardTitle className="text-base">Đường link Wiki đích</CardTitle>
                  <CardDescription>Nhập URL của trang Wiki cha - bài viết mới sẽ được tạo bên dưới trang này</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input placeholder="https://xxx.larksuite.com/wiki/NODETOKEN" value={wikiUrl} onChange={(e) => { setWikiUrl(e.target.value); setWikiInfo(null); }} className="pl-10" disabled={isPublishing} />
                </div>
                <Button onClick={handleValidateUrl} disabled={!wikiUrl || validateUrl.isPending || isPublishing} variant="outline" className="bg-white">
                  {validateUrl.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span className="ml-1.5">Xác thực</span>
                </Button>
              </div>
              {wikiInfo && (
                <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-sm text-green-800">
                  <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                  <span>Wiki hợp lệ: <strong>{wikiInfo.title}</strong></span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step 2: Content Upload */}
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold">2</div>
                <div>
                  <CardTitle className="text-base">Nội dung bài viết</CardTitle>
                  <CardDescription>Tải file Markdown (.md) hoặc HTML (.html) và đặt tiêu đề</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title" className="text-sm font-medium">Tiêu đề bài viết</Label>
                <Input id="title" placeholder="Nhập tiêu đề cho bài viết..." value={title} onChange={(e) => setTitle(e.target.value)} disabled={isPublishing} />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">File nội dung</Label>
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:border-blue-300 hover:bg-blue-50/30 transition-all">
                  <input type="file" accept=".md,.markdown,.html,.htm" onChange={handleFileUpload} className="hidden" id="file-upload" disabled={isPublishing} />
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <Upload className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                    <p className="text-sm text-slate-600">
                      {fileName ? (
                        <span className="flex items-center justify-center gap-2">
                          <FileText className="w-4 h-4 text-blue-600" />
                          <strong className="text-blue-700">{fileName}</strong>
                          <Badge variant="secondary" className="text-xs">{contentType === "markdown" ? "MD" : "HTML"}</Badge>
                        </span>
                      ) : (<>Kéo thả hoặc <strong className="text-blue-600">chọn file</strong> (.md, .html)</>)}
                    </p>
                  </label>
                </div>
              </div>
              {content && (
                <Tabs value={contentType} onValueChange={(v) => setContentType(v as "markdown" | "html")}>
                  <div className="flex items-center justify-between">
                    <TabsList className="h-8">
                      <TabsTrigger value="markdown" className="text-xs px-3 h-7">Markdown</TabsTrigger>
                      <TabsTrigger value="html" className="text-xs px-3 h-7">HTML</TabsTrigger>
                    </TabsList>
                    <Button variant="ghost" size="sm" onClick={handlePreview} disabled={previewMutation.isPending} className="text-xs">
                      {previewMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Eye className="w-3 h-3 mr-1" />}
                      Phân tích
                    </Button>
                  </div>
                  <TabsContent value="markdown" className="mt-2">
                    <div className="bg-slate-900 rounded-lg p-4 max-h-48 overflow-auto">
                      <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono">{content.slice(0, 2000)}{content.length > 2000 && "\n\n... (truncated)"}</pre>
                    </div>
                  </TabsContent>
                  <TabsContent value="html" className="mt-2">
                    <div className="bg-slate-900 rounded-lg p-4 max-h-48 overflow-auto">
                      <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono">{content.slice(0, 2000)}{content.length > 2000 && "\n\n... (truncated)"}</pre>
                    </div>
                  </TabsContent>
                </Tabs>
              )}
              {previewData && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                  <p>Phân tích: <strong>{previewData.blockCount}</strong> blocks nội dung, <strong>{previewData.imageRefs.length}</strong> tham chiếu ảnh</p>
                  {previewData.imageRefs.length > 0 && <p className="mt-1 text-xs text-blue-600">Ảnh tham chiếu: {previewData.imageRefs.join(", ")}</p>}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step 3: Images */}
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold">3</div>
                <div>
                  <CardTitle className="text-base">Ảnh đính kèm (tuỳ chọn)</CardTitle>
                  <CardDescription>Tải lên các ảnh được tham chiếu trong file nội dung</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center hover:border-blue-300 hover:bg-blue-50/30 transition-all">
                  <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" id="image-upload" disabled={isPublishing} />
                  <label htmlFor="image-upload" className="cursor-pointer">
                    <ImageIcon className="w-6 h-6 mx-auto text-slate-400 mb-1" />
                    <p className="text-sm text-slate-600"><strong className="text-blue-600">Chọn ảnh</strong> (hỗ trợ nhiều ảnh)</p>
                  </label>
                </div>
                {images.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {images.map((img, i) => (
                      <div key={i} className="relative group rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                        <img src={URL.createObjectURL(img.file)} alt={img.name} className="w-full h-24 object-cover" />
                        <div className="p-2"><p className="text-xs text-slate-600 truncate">{img.name}</p></div>
                        <button onClick={() => removeImage(i)} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Separator />

          {publishStep === "idle" && (
            <div className="flex justify-center">
              <Button size="lg" onClick={handlePublish} disabled={!wikiUrl || !title || !content} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-8 shadow-lg shadow-blue-200">
                <Send className="w-4 h-4 mr-2" />Đẩy lên Lark Wiki
              </Button>
            </div>
          )}

          {isPublishing && (
            <Card className="border-blue-200 bg-blue-50/50">
              <CardContent className="pt-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-blue-800">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{stepLabels[publishStep]}</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                  <p className="text-xs text-blue-600 text-right">{progress}%</p>
                </div>
              </CardContent>
            </Card>
          )}

          {publishStep === "done" && (
            <Card className="border-green-200 bg-green-50/50">
              <CardContent className="pt-6">
                <div className="text-center space-y-4">
                  <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto" />
                  <div>
                    <h3 className="text-lg font-bold text-green-900">Đã đẩy bài viết thành công!</h3>
                    <p className="text-sm text-green-700 mt-1">Bài viết "{title}" đã được tạo trên Lark Wiki</p>
                  </div>
                  <div className="flex items-center justify-center gap-3">
                    <a href={resultUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium">
                      Xem bài viết<ArrowRight className="w-4 h-4" />
                    </a>
                    <Button variant="outline" onClick={handleReset} className="bg-white">Đẩy bài khác</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {publishStep === "error" && (
            <Card className="border-red-200 bg-red-50/50">
              <CardContent className="pt-6">
                <div className="text-center space-y-3">
                  <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
                  <div>
                    <h3 className="text-base font-bold text-red-900">Đã xảy ra lỗi</h3>
                    <p className="text-sm text-red-700 mt-1">{errorMsg}</p>
                  </div>
                  <Button variant="outline" onClick={handleReset} className="bg-white">Thử lại</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <footer className="border-t bg-white/60 mt-12">
        <div className="container py-4 text-center text-xs text-slate-400">
          Lark Wiki Publisher &mdash; Tự động đẩy nội dung Markdown/HTML lên Lark Wiki
        </div>
      </footer>
    </div>
  );
}
