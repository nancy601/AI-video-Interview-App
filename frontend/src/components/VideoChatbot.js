"use client"

import React, { useState, useRef, useEffect } from "react"
import { Button } from "./ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "./ui/card"
import { Loader2, Send, Mic, MicOff } from "lucide-react"

export default function VideoChatbot() {
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isAIResponding, setIsAIResponding] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState("")
  const [recognition, setRecognition] = useState(null)
  const [error, setError] = useState(null)
  const videoRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])

  useEffect(() => {
    if (typeof window !== "undefined") {
      navigator.mediaDevices
        .getUserMedia({ video: true, audio: true })
        .then((stream) => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream
            mediaRecorderRef.current = new MediaRecorder(stream)

            mediaRecorderRef.current.ondataavailable = (event) => {
              if (event.data.size > 0) {
                chunksRef.current.push(event.data)
              }
            }

            mediaRecorderRef.current.onstop = () => {
              const blob = new Blob(chunksRef.current, { type: "video/webm" })
              sendVideoToServer(blob)
              chunksRef.current = []
            }

            mediaRecorderRef.current.start()
            console.log("Media recording started")
          }
        })
        .catch((err) => {
          console.error("Error accessing media devices:", err)
          setError("Failed to access camera and microphone")
        })
    }

    return () => {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop()
        console.log("Media recording stopped")
      }
    }
  }, [])

  const sendVideoToServer = async (blob) => {
    const formData = new FormData()
    formData.append("video", blob, "recording.webm")

    try {
      const response = await fetch("http://127.0.0.1:5000/api/save-video", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        throw new Error("Failed to send video to server")
      }

      console.log("Video sent to server successfully")
    } catch (error) {
      console.error("Error sending video to server:", error)
      setError("Failed to save video")
    }
  }

  const toggleListening = () => {
    setIsListening((prevIsListening) => {
      if (!prevIsListening) {
        try {
          const newRecognition = startSpeechRecognition()
          setRecognition(newRecognition)
          console.log("Speech recognition started")
        } catch (error) {
          console.error("Error starting speech recognition:", error)
          setError("Failed to start speech recognition")
          return false
        }
      } else {
        if (recognition) {
          recognition.stop()
          console.log("Speech recognition stopped")
        }
        setRecognition(null)
      }
      return !prevIsListening
    })
  }

  const startSpeechRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      throw new Error("Speech recognition not supported in this browser")
    }
    const recognition = new SpeechRecognition()

    recognition.continuous = true
    recognition.interimResults = true

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0])
        .map((result) => result.transcript)
        .join("")

      if (!isSpeaking && !isAIResponding) {
        setInput(transcript)
      }
    }

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error)
      setError(`Speech recognition error: ${event.error}`)
    }

    recognition.start()
    return recognition
  }

  const stopSpeechRecognition = () => {
    if (recognition) {
      recognition.stop()
      console.log("Speech recognition stopped")
    }
  }

  const speakMessage = (text) => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel()

      if (recognition) {
        recognition.stop()
        setIsListening(false)
      }

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.onstart = () => {
        setIsSpeaking(true)
        console.log("Text-to-speech started")
      }
      utterance.onend = () => {
        setIsSpeaking(false)
        console.log("Text-to-speech ended")
        if (isListening) {
          try {
            const newRecognition = startSpeechRecognition()
            setRecognition(newRecognition)
          } catch (error) {
            console.error("Error restarting speech recognition:", error)
            setError("Failed to restart speech recognition")
          }
        }
      }
      utterance.onerror = (event) => {
        console.error("Text-to-speech error:", event.error)
        setError(`Text-to-speech error: ${event.error}`)
      }
      window.speechSynthesis.speak(utterance)
    } else {
      console.error("Text-to-speech not supported in this browser")
      setError("Text-to-speech not supported in this browser")
    }
  }

  const sendMessageToAPI = async () => {
    setIsAIResponding(true)
    setError(null)

    const payload = {
      messages: [...messages, { role: "user", content: input }],
    }

    try {
      const response = await fetch("http://127.0.0.1:5000/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error("Failed to communicate with the server")
      }

      const data = await response.json()
      if (data.message) {
        const newMessages = [
          ...messages,
          { role: "user", content: input },
          { role: "assistant", content: data.message },
        ]
        setMessages(newMessages)
        speakMessage(data.message)

        // Send chat history to server
        await sendChatHistoryToServer(newMessages)
      }
    } catch (error) {
      console.error("Error:", error)
      setError(`Failed to get AI response: ${error.message}`)
    } finally {
      setIsAIResponding(false)
      setInput("")
    }
  }

  const sendChatHistoryToServer = async (chatHistory) => {
    try {
      const response = await fetch("http://127.0.0.1:5000/api/save-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ chatHistory }),
      })

      if (!response.ok) {
        throw new Error("Failed to save chat history")
      }

      console.log("Chat history saved successfully")
    } catch (error) {
      console.error("Error saving chat history:", error)
      setError("Failed to save chat history")
    }
  }

  const handleInputChange = (e) => {
    if (!isAIResponding) {
      setInput(e.target.value)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (input.trim()) {
      sendMessageToAPI()
    }
  }

  return (
    <div className="w-full max-w-3xl mx-auto p-4">
      <Card className="w-full bg-black min-h-screen text-white">
        <CardHeader className="border-b border-gray-800">
          <CardTitle className="text-gray-200">Video Chatbot</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <video ref={videoRef} autoPlay muted className="w-full h-64 bg-gray-900 border-b border-gray-800" />
          <div className="h-[400px] overflow-y-auto p-4 bg-black space-y-4">
            {messages.map((m, index) => (
              <div key={index} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                    m.role === "user" ? "bg-white text-black" : "bg-gray-700 text-white"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {error && <div className="text-red-500 text-center">{error}</div>}
          </div>
        </CardContent>
        <CardFooter className="p-4 bg-black border-t border-gray-800">
          <form onSubmit={handleSubmit} className="flex w-full gap-2">
            <input
              value={input}
              onChange={handleInputChange}
              placeholder="Type a message..."
              className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-full border-none focus:outline-none focus:ring-2 focus:ring-gray-700"
              disabled={isAIResponding}
            />
            <Button
              type="submit"
              disabled={isAIResponding}
              className="bg-gray-700 text-white rounded-full px-6 hover:bg-gray-600"
            >
              {isAIResponding ? <Loader2 className="animate-spin" /> : "Send"}
            </Button>
            <Button
              onClick={toggleListening}
              disabled={isAIResponding}
              className={`rounded-full px-6 ${
                isListening ? "bg-red-500 text-white hover:bg-red-600" : "bg-gray-700 text-white hover:bg-gray-600"
              }`}
            >
              {isListening ? "Stop" : "Start"} Listening
            </Button>
          </form>
        </CardFooter>
      </Card>
    </div>
  )
}

