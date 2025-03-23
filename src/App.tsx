import { useCallback, useState } from "react";
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
  const [outputFormat, setOutputFormat] = useState<string>("ogg"); // New state for output format
  
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

  const processAudio = useCallback(async () => {
    logEvent(getAnalytics(firebaseApp), "process_audio");

    try {
      setProgress(undefined);
      setError(undefined);
      setOutput(undefined);

      if (!input) {
        return;
      }

      if (!ffmpeg.isLoaded()) {
        await ffmpeg.load();
      }

      const { name } = input.file;
      ffmpeg.FS("writeFile", name, await fetchFile(input.file));
      const outputFilename = `${name}_processed_${Date.now()}.${outputFormat}`; // Use selected format

      // Build FFmpeg commands based on selected options
      const ffmpegCommands = ["-i", name];

      // Conditional Filters
      if (normalizeVolume) {
        ffmpegCommands.push("-af", "dynaudnorm=g=20:f=150:p=0.95"); // Stronger dynamic normalization
      }
      if (reduceNoise) {
        ffmpegCommands.push("-af", "arnndn=m=arnndn_model_file_path"); // Add noise reduction
      }
      if (reduceHarshFrequencies) {
        ffmpegCommands.push("-af", "equalizer=f=5000:t=q:w=2:g=-5"); // Target harsh frequencies
      }
      if (convertToMono) {
        ffmpegCommands.push("-ac", "1"); // Set audio to mono
      }

      // Apply final volume boost as a last step
      ffmpegCommands.push("-af", "volume=5.0");

      ffmpegCommands.push(outputFilename);

      await ffmpeg.run(...ffmpegCommands);
      const data = ffmpeg.FS("readFile", outputFilename);
      if (!data.length) {
        setError("An unknown error occurred, see developer console");
        return;
      }

      setOutput({
        url: URL.createObjectURL(new Blob([data.buffer], { type: `audio/${outputFormat}` })),
        name: outputFilename,
      });
    } catch (error) {
      setProgress(null);
      setError(
        typeof error === "object" &&
          !!error &&
          "message" in error &&
          typeof error.message === "string"
          ? error.message
          : "An unknown error occurred, see developer console"
      );
    }
  }, [ffmpeg, input, normalizeVolume, reduceNoise, reduceHarshFrequencies, convertToMono, outputFormat]);

  return (
    <div className="App max-w-4xl mx-auto p-6">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-2xl font-bold">音频增强工具</CardTitle>
          <CardDescription>本地增强音频文件，适合一般录音但可能不适用于音乐</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            {/* 使用自定义的文件上传区域 */}
            {(() => {
              const dropzoneProps = useDropzone({
                onDropFile: async (file: File) => {
                  setProgress(null);
                  setError(undefined);
                  setOutput(undefined);
                  
                  if (file.type.startsWith('audio/')) {
                    setInput({ file, url: URL.createObjectURL(file) });
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
                  <DropZoneArea className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:bg-gray-50 transition-colors">
                    <DropzoneMessage>
                      拖放音频文件到此处，或点击选择
                    </DropzoneMessage>
                    <DropzoneDescription>
                      支持所有常见音频格式
                    </DropzoneDescription>
                    <DropzoneTrigger>
                      <Button variant="outline" className="mt-4">
                        选择音频文件
                      </Button>
                    </DropzoneTrigger>
                  </DropZoneArea>
                </Dropzone>
              );
            })()}
          </div>

          {!!input && (
            <>
              <div className="player-container mb-6 bg-gray-100 p-4 rounded-md">
                <audio controls src={input.url} className="w-full" />
                <p className="text-sm text-gray-500 mt-2">文件名: {input.file.name}</p>
              </div>
              
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">增强选项</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Toggles for audio enhancement options using Switch */}
                    <div className="flex items-center justify-between">
                      <Label htmlFor="normalize-volume">音量标准化</Label>
                      <Switch
                        id="normalize-volume"
                        checked={normalizeVolume}
                        onCheckedChange={setNormalizeVolume}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="reduce-noise">降低背景噪音</Label>
                      <Switch
                        id="reduce-noise"
                        checked={reduceNoise}
                        onCheckedChange={setReduceNoise}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="reduce-harsh">减少刺耳频率</Label>
                      <Switch
                        id="reduce-harsh"
                        checked={reduceHarshFrequencies}
                        onCheckedChange={setReduceHarshFrequencies}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="convert-mono">转换为单声道</Label>
                      <Switch
                        id="convert-mono"
                        checked={convertToMono}
                        onCheckedChange={setConvertToMono}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Output format selection */}
                <div className="space-y-2">
                  <Label htmlFor="output-format">输出格式</Label>
                  <Select value={outputFormat} onValueChange={setOutputFormat}>
                    <SelectTrigger id="output-format">
                      <SelectValue placeholder="选择输出格式" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ogg">OGG</SelectItem>
                      <SelectItem value="mp3">MP3</SelectItem>
                      <SelectItem value="wav">WAV</SelectItem>
                      <SelectItem value="flac">FLAC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button onClick={processAudio} className="w-full">处理音频</Button>
                
                {progress !== null && progress !== 100 && (
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div 
                      className="bg-blue-600 h-2.5 rounded-full" 
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                )}
                
                {!!error && (
                  <div className="p-4 text-red-700 bg-red-100 rounded-md">
                    {error}
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {!!output && (
        <Card>
          <CardHeader>
            <CardTitle>处理结果</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="player-container bg-gray-100 p-4 rounded-md mb-4">
              <audio controls src={output.url} className="w-full" />
            </div>
            <Button variant="outline" className="w-full" asChild>
              <a href={output.url} download={output.name}>
                下载处理后的音频
              </a>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="mt-8 text-center text-gray-500 text-sm">
        <p>
          by Louis Lagrange (
          <a href="https://twitter.com/Minishlink" target="_blank" className="text-blue-500 hover:underline">
            @Minishlink
          </a>
          )
        </p>
        <p>
          <a
            href="https://github.com/Minishlink/audio-compressor-webapp"
            target="_blank"
            className="text-blue-500 hover:underline"
          >
            GitHub
          </a>
        </p>
      </div>
    </div>
  );
}
