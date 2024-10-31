import { useCallback, useState } from "react";
import { createFFmpeg, fetchFile } from "@ffmpeg/ffmpeg";
import { getAnalytics, logEvent } from "firebase/analytics";
import { app as firebaseApp } from "./firebase";
import "./App.css";

export function App() {
  const [input, setInput] = useState<{ file: File; url: string } | undefined>();
  const [progress, setProgress] = useState<number | undefined | null>(null);
  const [error, setError] = useState<string | undefined>();
  
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
      const outputFilename = `${name}_processed_${Date.now()}.ogg`;

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
        url: URL.createObjectURL(new Blob([data.buffer], { type: "audio/ogg" })),
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
  }, [ffmpeg, input, normalizeVolume, reduceNoise, reduceHarshFrequencies, convertToMono]);



  return (
    <div className="App">
      <header>
        <h1>音频增强工具</h1>
      </header>
      <section>
        <p>本地增强音频文件，适合一般录音但可能不适用于音乐</p>
        <input
          type="file"
          accept="audio/*"
          onChange={(event) => {
            setProgress(null);
            setError(undefined);
            setOutput(undefined);

            const file = event.target.files?.[0];
            setInput(file ? { file, url: URL.createObjectURL(file) } : undefined);
          }}
        />
        {!!input && (
          <>
            <div className="player-container">
              <audio controls src={input.url} />
            </div>
            
            {/* Toggles for audio enhancement options */}
            <div className="toggle-options">
              <label>
                <input
                  type="checkbox"
                  checked={normalizeVolume}
                  onChange={() => setNormalizeVolume(!normalizeVolume)}
                />
                Normalize Volume
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={reduceNoise}
                  onChange={() => setReduceNoise(!reduceNoise)}
                />
                Reduce Background Noise
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={reduceHarshFrequencies}
                  onChange={() => setReduceHarshFrequencies(!reduceHarshFrequencies)}
                />
                Reduce Harsh Frequencies
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={convertToMono}
                  onChange={() => setConvertToMono(!convertToMono)}
                />
                Convert to Mono
              </label>
            </div>

            <button onClick={processAudio}>Process Audio</button>
            {progress !== null && progress !== 100 && (
              <div>
                <progress max="100" value={progress}>{`${progress}%`}</progress>
              </div>
            )}
            {!!error && <p className="error">{error}</p>}
          </>
        )}
        {!!output && (
          <div>
            <h2>结果</h2>
            <div className="player-container">
              <audio controls src={output.url} />
            </div>
            <a href={output.url} download={output.name}>
              下载
            </a>
          </div>
        )}
      </section>
      <div id="author">
        <p>
          by Louis Lagrange (
          <a href="https://twitter.com/Minishlink" target="_blank">
            @Minishlink
          </a>
          )
        </p>
      </div>
      <div id="source-code">
        <p>
          <a
            href="https://github.com/Minishlink/audio-compressor-webapp"
            target="_blank"
          >
            GitHub
          </a>
        </p>
      </div>
    </div>
  );
}
