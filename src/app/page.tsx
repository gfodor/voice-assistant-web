"use client"
import React, { useEffect } from "react";
import Image from "next/image";
import axios from "axios";

let threadId = ""
let mediaRecorder:MediaRecorder
let chunks: any = [];
let pendingImageUrl: string | null = null

type RGBColor = [number, number, number];

enum BACKGROUND_ANIMATION_STATES {
  WAITING = "WAITING",
  LISTENING = "LISTENING",
  THINKING = "THINKING",
}

const idleColor: RGBColor = [255, 0, 255]; // Bright magenta
const listeningColor: RGBColor = [255, 140, 255]; // Lighter magenta

let currentState: BACKGROUND_ANIMATION_STATES = BACKGROUND_ANIMATION_STATES.WAITING;
let startTime: number = Date.now();

// Linear interpolation between two colors
function lerpColor(color1: RGBColor, color2: RGBColor, factor: number): RGBColor {
  return color1.map((c1, i) => Math.round(c1 + factor * (color2[i] - c1))) as RGBColor;
}

// Update the background color based on the current state
function updateBackgroundColor(): void {
  const elapsed: number = (Date.now() - startTime) / 1000;
  let color: RGBColor;

  switch (currentState) {
    case BACKGROUND_ANIMATION_STATES.WAITING:
      color = idleColor;
      break;
    case BACKGROUND_ANIMATION_STATES.LISTENING:
      // Crossfade to lighter magenta over 2 seconds
      color = lerpColor(idleColor, listeningColor, Math.min(1, elapsed));
      break;
    case BACKGROUND_ANIMATION_STATES.THINKING:
      // Pulse between two magentas using a sine curve
      const factor: number = (Math.sin(elapsed * 2) + 1) / 2; // Oscillates between 0 and 1
      color = lerpColor(idleColor, listeningColor, factor);
      break;
    default:
      color = idleColor;
  }

  document.body.style.backgroundColor = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
}

export default function page() {
  useEffect(() => {
    const tick = (): void => {
      updateBackgroundColor();

      window.requestAnimationFrame(tick);
    };

    // @ts-ignore
    window.requestAnimationFrame(tick);

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

        currentState = BACKGROUND_ANIMATION_STATES.WAITING;

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

    document.addEventListener("mousedown", async () => {
      if (currentState === BACKGROUND_ANIMATION_STATES.THINKING) return
      if (currentState === BACKGROUND_ANIMATION_STATES.LISTENING) return
      currentState = BACKGROUND_ANIMATION_STATES.LISTENING;
      const videoEl = document.querySelector("video")
      if (videoEl) videoEl.style.opacity = "1"

      if (!mediaRecorder) {
        await new Promise(res => {
          navigator.mediaDevices
            .getUserMedia({ audio: true })
            .then((stream) => {
              navigator.mediaDevices
                .getUserMedia({video: { width: { ideal: 640 }, height: { ideal: 480 } }})
                .then((stream) => {
                  const videoEl = document.createElement("video");
                  videoEl.style.width = "530px"
                  videoEl.style.height = "400px"
                  videoEl.style.opacity = "0"
                  videoEl.style.transition = "opacity 0.5s ease"
                  // Center the video el horizontally and vertically
                  videoEl.style.position = "absolute";
                  videoEl.style.top = "50%";
                  videoEl.style.left = "50%";
                  videoEl.style.transform = "translate(-50%, -50%)";
                  videoEl.srcObject = stream;
                  document.body.appendChild(videoEl);
                  videoEl.style.opacity = "1"
                  videoEl.play();
                });

              const newMediaRecorder = new MediaRecorder(stream);
              newMediaRecorder.onstart = () => {
                chunks = [];
              };
              newMediaRecorder.ondataavailable = (e) => {
                chunks.push(e.data);
              };
              newMediaRecorder.onstop = async () => {
                currentState = BACKGROUND_ANIMATION_STATES.THINKING;
                const videoEl = document.querySelector("video")
                if (videoEl) videoEl.style.opacity = "0"

                document.body.style.backgroundColor = "green";

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

                    // Get LLM completion
                    const res = await axios.post("/api/chat", {
                      content: `${data.result} Your answer has to be as consise as possible.`,
                      thread_id: threadId,
                      image_url: pendingImageUrl,
                    });

                    threadId = res.data.thread_id

                    // Convert to speech
                    playAudio(res.data.message);
                    const videoEl = document.querySelector("video")

                    document.body.style.backgroundColor = "white";
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
      if (currentState !== BACKGROUND_ANIMATION_STATES.LISTENING) return
      pendingImageUrl = null;

      const videoEl = document.querySelector("video");
      const canvas = document.createElement("canvas");
      if (!videoEl) return;

      canvas.width = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      pendingImageUrl = canvas.toDataURL("image/png");
      mediaRecorder.stop();
    })
  }, [])

  return (
    <div>
    </div>
  );
}
