"use client";

// Import necessary libraries
import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { motion } from "framer-motion";
import toast from "react-hot-toast";

let threadId = ""
let mediaRecorder:MediaRecorder

// This is the main component of our application
export default function AssistantButton() {
  const [mediaRecorderInitialized, setMediaRecorderInitialized] =
    useState(false);

  const [loading, setLoading] = useState(false);

  const [audioPlaying, setAudioPlaying] = useState(false);
  const inputRef = useRef(null);
  const [inputValue, setInputValue] = useState("");

  const playAudio = async (input: string) => {
    const CHUNK_SIZE = 1024;
    const url =
      "https://api.elevenlabs.io/v1/text-to-speech/OhAFb7etDtNIIxEeb6D9/stream";
    const headers = {
      Accept: "audio/mpeg",
      "Content-Type": "application/json",
      "xi-api-key": process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY || "",
    };
    const data = {
      text: input,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.5,
      },
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error("Network response was not ok.");
      }

      const audioContext = new (window.AudioContext ||
        // @ts-ignore
        window.webkitAudioContext)();
      const source = audioContext.createBufferSource();

      const audioBuffer = await response.arrayBuffer();
      const audioBufferDuration = audioBuffer.byteLength / CHUNK_SIZE;
      audioContext.decodeAudioData(audioBuffer, (buffer) => {
        source.buffer = buffer;
        source.connect(audioContext.destination);
        source.start();
      });

      setTimeout(() => {
        source.stop();
        audioContext.close();
        setAudioPlaying(false); // Reset audioPlaying state after audio ends
      }, audioBufferDuration * 1000);
    } catch (error) {
      console.error("Error:", error);
      setAudioPlaying(false); // Reset audioPlaying state on error
    }
  };

  const handlePlayButtonClick = (input: string) => {
    setAudioPlaying(true);
    playAudio(input);
  };

  // Define state variables for the result, recording status, and media recorder
  const [result, setResult] = useState();
  const [recording, setRecording] = useState(false);
  // This array will hold the audio data
  let chunks: any = [];
  // This useEffect hook sets up the media recorder when the component mounts

  // Function to start recording
  const startRecording = () => {
    if (mediaRecorder) {
      //@ts-ignore

      mediaRecorder.start();
      setRecording(true);
    }
  };
  // Function to stop recording
  const stopRecording = () => {
    toast("Thinking", {
      duration: 5000,
      icon: "💭",
      style: {
        borderRadius: "10px",
        background: "#1E1E1E",
        color: "#F9F9F9",
        border: "0.5px solid #3B3C3F",
        fontSize: "14px",
      },
      position: "top-right",
    });
    if (mediaRecorder) {
      //@ts-ignore

      mediaRecorder.stop();
      setRecording(false);
    }
  };

  // Framer motion
  // Different states
  // intro (x)
  // idle (auto)
  // listening
  // thinking

  return (
    <div>
      <motion.div
        onClick={async () => {
          const granted = (await navigator.permissions.query({
            // @ts-ignore
            name: "microphone",
          })).state === "granted";

          if (typeof window !== "undefined" && !mediaRecorderInitialized) {
            // Set the init state to true, so we don't init on every click
            mediaRecorderInitialized ? null : setMediaRecorderInitialized(true);

            navigator.mediaDevices
              .getUserMedia({ audio: true })
              .then((stream) => {
                const newMediaRecorder = new MediaRecorder(stream);
                newMediaRecorder.onstart = () => {
                  chunks = [];
                };
                newMediaRecorder.ondataavailable = (e) => {
                  chunks.push(e.data);
                };
                newMediaRecorder.onstop = async () => {
                  console.time("Entire function");

                  const audioBlob = new Blob(chunks, { type: "audio/webm" });
                  const audioUrl = URL.createObjectURL(audioBlob);
                  const audio = new Audio(audioUrl);
                  audio.onerror = function (err) {
                    console.error("Error playing audio:", err);
                  };
                  // audio.play();
                  try {
                    const reader = new FileReader();
                    reader.readAsDataURL(audioBlob);
                    reader.onloadend = async function () {
                      //@ts-ignore
                      const base64Audio = reader.result.split(",")[1]; // Remove the data URL prefix

                      // Speech to text
                      const response = await fetch("/api/speechToText", {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                        },
                        body: JSON.stringify({ audio: base64Audio }),
                      });
                      const data = await response.json();
                      if (response.status !== 200) {
                        throw (
                          data.error ||
                          new Error(
                            `Request failed with status ${response.status}`
                          )
                        );
                      }
                      console.timeEnd("Speech to Text");

                      // Get LLM completion
                      const res = await axios.post("/api/chat", {
                        content: `${data.result} Your answer has to be as consise as possible.`,
                        thread_id: threadId
                      });
                      console.log("Got", res)
                      console.log("set thread id", res.data.thread_id)

                      threadId = res.data.thread_id

                      // Convert to speech
                      handlePlayButtonClick(res.data.message);
                    };
                  } catch (error) {
                    console.error(error);
                    //@ts-ignore
                    alert(error.message);
                  }
                };
                //@ts-ignore
                mediaRecorder = newMediaRecorder;
              })
              .catch((err) =>
                console.error("Error accessing microphone:", err)
              );
          }

          if (!mediaRecorderInitialized && !granted) {
            toast(
              "Please grant access to your microphone. Click the button again to speak.",
              {
                duration: 5000,
                icon: "🙌",
                style: {
                  borderRadius: "10px",
                  background: "#1E1E1E",
                  color: "#F9F9F9",
                  border: "0.5px solid #3B3C3F",
                  fontSize: "14px",
                },
                position: "top-right",
              }
            );
            return;
          }

          recording
            ? null
            : toast("Listening - Click again to send", {
                icon: "🟢",
                style: {
                  borderRadius: "10px",
                  background: "#1E1E1E",
                  color: "#F9F9F9",
                  border: "0.5px solid #3B3C3F",
                  fontSize: "14px",
                },
                position: "top-right",
              });

          // TOTAL HACK
          recording ? stopRecording() : setTimeout(() => startRecording(), 100)
        }}
        // onClick={recording ? stopRecording : startRecording}
        className="hover:scale-105 ease-in-out duration-500 hover:cursor-pointer text-[70px]"
      >
        <div className="rainbow-container">
          <div className="green"></div>
          <div className="pink"></div>
        </div>
      </motion.div>
    </div>
  );
}
