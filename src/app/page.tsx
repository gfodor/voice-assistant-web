"use client"
import React, { useEffect } from "react";
import Image from "next/image";
import axios from "axios";

let threadId = ""
let mediaRecorder:MediaRecorder
let chunks: any = [];

export default function page() {
  useEffect(() => {
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
        }, audioBufferDuration * 1000);
      } catch (error) {
        console.error("Error:", error);
      }
    };

    const handlePlayButtonClick = (input: string) => {
      playAudio(input);
    };

    document.addEventListener("mousedown", async () => {
      if (!mediaRecorder) {
        await new Promise(res => {
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
              res(mediaRecorder);
            })
            .catch((err) =>
              console.error("Error accessing microphone:", err)
            );
        });
      }

      mediaRecorder.start();
    })

    document.addEventListener("mouseup", async () => {
      mediaRecorder.stop();
    })
  }, [])

  return (
    <div>
    </div>
  );
}
