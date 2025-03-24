import { useCallback, useState, useEffect } from "react";
import { createFFmpeg, fetchFile } from "@ffmpeg/ffmpeg";
import { getAnalytics, logEvent } from "firebase/analytics";
import { app as firebaseApp } from "./firebase";
import { Button } from "./components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";
import { Switch } from "./components/ui/switch";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./components/ui/card";
import { Label } from "./components/ui/label";
import {
  Dropzone,
  DropZoneArea,
  DropzoneDescription,
  DropzoneMessage,
  DropzoneTrigger,
  useDropzone,
} from "./components/ui/dropzone";
import "./App.css";

export function App() {
  const [input, setInput] = useState<{ file: File; url: string } | undefined>();
  const [progress, setProgress] = useState<number | undefined | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [outputFormat, setOutputFormat] = useState<string>("ogg");
  const [isProcessing, setIsProcessing] = useState(false);
  const [originalSize, setOriginalSize] = useState<string>("");
  const [processedSize, setProcessedSize] = useState<string>("");
  const [compressionRatio, setCompressionRatio] = useState<number>(0);
  
  // Enhancement toggles
  const [normalizeVolume, setNormalizeVolume] = useState(false);
  const [reduceNoise, setReduceNoise] = useState(false);
  const [reduceHarshFrequencies, setReduceHarshFrequencies] = useState(false);
  const [convertToMono, setConvertToMono] = useState(false);

  const [ffmpeg] = useState(() =>
    createFFmpeg({
      log: true,
      progress: ({ ratio }) => setProgress(ratio * 100),
    })
  );

  const [output, setOutput] = useState<{ url: string; name: string } | undefined>();

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const processAudio = useCallback(async () => {
    logEvent(getAnalytics(firebaseApp), "process_audio");

    try {
      setIsProcessing(true);
      setProgress(undefined);
      setError(undefined);
      setOutput(undefined);
      setProcessedSize("");
      setCompressionRatio(0);

      if (!input) {
        setIsProcessing(false);
        return;
      }

      // 设置原始文件大小
      const originalSizeBytes = input.file.size;
      setOriginalSize(formatFileSize(originalSizeBytes));

      if (!ffmpeg.isLoaded()) {
        await ffmpeg.load();
      }

      const { name } = input.file;
      ffmpeg.FS("writeFile", name, await fetchFile(input.file));
      const outputFilename = `${name}_processed_${Date.now()}.${outputFormat}`;

      // 构建FFmpeg命令
      let filterComplex = [];
      
      if (normalizeVolume) {
        filterComplex.push("dynaudnorm=g=20:f=150:p=0.95");
      }
      if (reduceNoise) {
        filterComplex.push("anlmdn=s=0.3:p=0.001"); // 更有效的降噪滤镜
      }
      if (reduceHarshFrequencies) {
        filterComplex.push("equalizer=f=5000:t=q:w=2:g=-5");
      }
      
      // 构建命令数组
      const ffmpegCommands = ["-i", name];
      
      if (filterComplex.length > 0) {
        ffmpegCommands.push("-af", filterComplex.join(","));
      }
      
      if (convertToMono) {
        ffmpegCommands.push("-ac", "1");
      }
      
      // 根据输出格式优化编码参数
      if (outputFormat === "mp3") {
        ffmpegCommands.push("-b:a", "192k");
      } else if (outputFormat === "ogg") {
        ffmpegCommands.push("-q:a", "6");
      } else if (outputFormat === "flac") {
        ffmpegCommands.push("-compression_level", "8");
      }
      
      ffmpegCommands.push(outputFilename);

      await ffmpeg.run(...ffmpegCommands);
      const data = ffmpeg.FS("readFile", outputFilename);
      if (!data.length) {
        setError("处理过程中发生错误，请查看控制台");
        setIsProcessing(false);
        return;
      }

      // 计算处理后的文件大小和压缩率
      const processedSizeBytes = data.length;
      setProcessedSize(formatFileSize(processedSizeBytes));
      
      const ratio = ((originalSizeBytes - processedSizeBytes) / originalSizeBytes) * 100;
      setCompressionRatio(Math.round(ratio));

      setOutput({
        url: URL.createObjectURL(new Blob([data.buffer], { type: `audio/${outputFormat}` })),
        name: outputFilename,
      });
      setIsProcessing(false);
    } catch (error) {
      setProgress(null);
      setIsProcessing(false);
      setError(
        typeof error === "object" &&
          !!error &&
          "message" in error &&
          typeof error.message === "string"
          ? error.message
          : "处理过程中发生错误，请查看控制台"
      );
    }
  }, [ffmpeg, input, normalizeVolume, reduceNoise, reduceHarshFrequencies, convertToMono, outputFormat]);

  return (
    <div className="App min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-5xl mx-auto p-6 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-3 bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">音频增强工具</h1>
          <p className="text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">在本地增强音频文件，提升音质和清晰度。所有处理都在您的设备上完成，不会上传到服务器。</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <div>
            <h2 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-gray-100">上传音频</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-6">支持MP3、WAV、OGG等常见音频格式</p>
            
            {/* 使用自定义的文件上传区域 */}
            {(() => {
              const dropzoneProps = useDropzone({
                onDropFile: async (file: File) => {
                  setProgress(null);
                  setError(undefined);
                  setOutput(undefined);
                  setOriginalSize("");
                  setProcessedSize("");
                  setCompressionRatio(0);
                  
                  if (file.type.startsWith('audio/')) {
                    setInput({ file, url: URL.createObjectURL(file) });
                    setOriginalSize(formatFileSize(file.size));
                    return { status: "success", result: file };
                  } else {
                    return { status: "error", error: "请上传音频文件" as string };
                  }
                },
                validation: {
                  accept: {
                    'audio/*': []
                  },
                  maxFiles: 1
                },
                shapeUploadError: (error: string) => error
              });
              
              return (
                <Dropzone {...dropzoneProps}>
                  <DropZoneArea className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <div className="flex flex-col items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-400 dark:text-gray-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                      </svg>
                      <DropzoneMessage className="text-lg font-medium text-gray-700 dark:text-gray-200 mb-2">
                        拖放音频文件到此处
                      </DropzoneMessage>
                      <DropzoneDescription className="text-gray-500 dark:text-gray-400 mb-4">
                        或点击选择文件上传
                      </DropzoneDescription>
                      <DropzoneTrigger>
                        <Button className="bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-700 dark:hover:bg-blue-800">
                          选择音频文件
                        </Button>
                      </DropzoneTrigger>
                    </div>
                  </DropZoneArea>
                </Dropzone>
              );
            })()}
          </div>

          <div className="lg:border-l lg:border-gray-200 lg:dark:border-gray-700 lg:pl-8">
            <h2 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-gray-100">增强选项</h2>
            
            {!input ? (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-8 text-center border border-gray-200 dark:border-gray-700">
                <p className="text-gray-500 dark:text-gray-400">请先上传音频文件</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
                  <h3 className="text-lg font-medium mb-3 text-gray-800 dark:text-gray-200">原始音频</h3>
                  <audio controls src={input.url} className="w-full mb-3" />
                  <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
                    <span>文件名: {input.file.name}</span>
                    <span>大小: {originalSize}</span>
                  </div>
                </div>
                
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
                  <h3 className="text-lg font-medium mb-4 text-gray-800 dark:text-gray-200">音频增强设置</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="normalize-volume" className="font-medium">音量标准化</Label>
                        <p className="text-xs text-gray-500 dark:text-gray-400">平衡音频音量，使声音更加均匀</p>
                      </div>
                      <Switch
                        id="normalize-volume"
                        checked={normalizeVolume}
                        onCheckedChange={setNormalizeVolume}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="reduce-noise" className="font-medium">降低背景噪音</Label>
                        <p className="text-xs text-gray-500 dark:text-gray-400">减少背景中的杂音和嗡嗡声</p>
                      </div>
                      <Switch
                        id="reduce-noise"
                        checked={reduceNoise}
                        onCheckedChange={setReduceNoise}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="reduce-harsh" className="font-medium">减少刺耳频率</Label>
                        <p className="text-xs text-gray-500 dark:text-gray-400">降低高频刺耳的声音</p>
                      </div>
                      <Switch
                        id="reduce-harsh"
                        checked={reduceHarshFrequencies}
                        onCheckedChange={setReduceHarshFrequencies}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="convert-mono" className="font-medium">转换为单声道</Label>
                        <p className="text-xs text-gray-500 dark:text-gray-400">将立体声转换为单声道，减小文件大小</p>
                      </div>
                      <Switch
                        id="convert-mono"
                        checked={convertToMono}
                        onCheckedChange={setConvertToMono}
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
                  <h3 className="text-lg font-medium mb-4 text-gray-800 dark:text-gray-200">输出设置</h3>
                  <div className="space-y-3">
                    <Label htmlFor="output-format" className="font-medium">输出格式</Label>
                    <Select value={outputFormat} onValueChange={setOutputFormat}>
                      <SelectTrigger id="output-format" className="w-full">
                        <SelectValue placeholder="选择输出格式" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mp3">MP3 - 兼容性最好</SelectItem>
                        <SelectItem value="ogg">OGG - 更好的压缩率</SelectItem>
                        <SelectItem value="wav">WAV - 无损音质</SelectItem>
                        <SelectItem value="flac">FLAC - 高质量压缩</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button 
                  onClick={processAudio} 
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-6 text-lg font-medium dark:bg-blue-700 dark:hover:bg-blue-800"
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      处理中...
                    </>
                  ) : "增强音频"}
                </Button>
                
                {progress !== null && progress !== 100 && (
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div 
                      className="bg-blue-600 dark:bg-blue-500 h-2 rounded-full transition-all duration-300" 
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                )}
                
                {!!error && (
                  <div className="p-4 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100 dark:border-red-800/30">
                    <div className="flex">
                      <svg className="h-5 w-5 text-red-500 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      {error}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {!!output && (
        <div className="max-w-5xl mx-auto px-6 pb-12">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200">处理完成</h3>
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-6 mb-6 border border-gray-100 dark:border-gray-800">
              <h4 className="text-lg font-medium mb-3 text-gray-800 dark:text-gray-200">增强后的音频</h4>
              <audio controls src={output.url} className="w-full mb-4" />
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">文件信息</p>
                  <div className="flex items-center justify-between bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                    <span className="text-sm text-gray-600 dark:text-gray-400">文件名</span>
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{output.name}</span>
                  </div>
                  <div className="flex items-center justify-between bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                    <span className="text-sm text-gray-600 dark:text-gray-400">输出格式</span>
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{outputFormat.toUpperCase()}</span>
                  </div>
                </div>
                
                {originalSize && processedSize && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">大小对比</p>
                    <div className="flex items-center justify-between bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                      <span className="text-sm text-gray-600 dark:text-gray-400">原始大小</span>
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{originalSize}</span>
                    </div>
                    <div className="flex items-center justify-between bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                      <span className="text-sm text-gray-600 dark:text-gray-400">处理后大小</span>
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{processedSize}</span>
                    </div>
                    {compressionRatio > 0 && (
                      <div className="flex items-center justify-between bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                        <span className="text-sm text-gray-600 dark:text-gray-400">压缩率</span>
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{compressionRatio.toFixed(2)}%</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row sm:justify-end space-y-3 sm:space-y-0 sm:space-x-4">
              <Button 
                variant="outline" 
                onClick={() => window.open(output.url)}
                className="w-full sm:w-auto border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                在新标签页打开
              </Button>
              <Button 
                onClick={() => {
                  const a = document.createElement('a');
                  a.href = output.url;
                  a.download = output.name;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  
                  // 记录下载事件
                  logEvent(getAnalytics(firebaseApp), 'download_processed_audio', {
                    format: outputFormat,
                    original_size: originalSize,
                    processed_size: processedSize,
                    compression_ratio: compressionRatio
                  });
                }}
                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-700 dark:hover:bg-blue-800"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                下载文件
              </Button>
            </div>
          </div>
          
          <div className="mt-8 text-center">
            <Button 
              variant="outline" 
              onClick={() => {
                setInput(undefined);
                setOutput(undefined);
                setProgress(null);
                setError(undefined);
                setOriginalSize("");
                setProcessedSize("");
                setCompressionRatio(0);
              }}
              className="text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              处理新文件
            </Button>
          </div>
        </div>
      )}

      <footer className="max-w-5xl mx-auto px-6 py-8 border-t border-gray-200 dark:border-gray-800 mt-8">
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="flex items-center space-x-2">
            <a href="https://github.com/Minishlink/audio-compressor-webapp" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
              </svg>
            </a>
            <a href="https://twitter.com/Minishlink" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"></path>
              </svg>
            </a>
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            开发者: Louis Lagrange (<a href="https://twitter.com/Minishlink" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors">@Minishlink</a>)
          </p>
          <p className="text-gray-400 dark:text-gray-500 text-xs">
            本应用在您的浏览器中处理所有音频，不会上传到任何服务器
          </p>
        </div>
      </footer>
    </div>
  );
}
