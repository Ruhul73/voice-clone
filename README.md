# ✨ EchoClone AI — Next-Gen Voice Cloning & Speech Synthesis

**EchoClone AI** is a state-of-the-art, web-based voice cloning application that enables users to clone any human voice with just 10–15 seconds of sample audio and synthesize realistic custom speech in seconds. 

Featuring a dual-engine AI architecture, a custom-built WebAudio WAV recorder, interactive progress tracking, and a sleek Glassmorphism dark UI, EchoClone AI provides an effortless end-to-end voice cloning experience.

---

## 🌟 Key Features

- 🎙️ **In-Browser Audio Recording**:
  - Built-in `WavRecorder` class encoding 16-bit PCM WAV audio directly in the browser at a 24,000 Hz sample rate.
  - Live soundwave animation visualizer and real-time recording timer.
- 📁 **Drag-and-Drop File Upload**:
  - Upload pre-recorded audio files supporting `MP3`, `WAV`, `M4A`, and `WEBM` (up to 10MB).
- ⚡ **Dual AI Engine Integration**:
  - **Fish Audio API (S2-Pro Flagship)**: High-speed, high-fidelity zero-shot voice cloning (1–2 seconds) with automatic audio quality enhancement.
  - **Hugging Face F5-TTS (E2-F5-TTS)**: Free CPU-based zero-shot TTS fallback model requiring no API key.
- 🎛️ **Custom Audio Player**:
  - Interactive HTML5 audio player with custom seek progress bar, duration indicators, play/pause toggle, and instant audio download link.
- 💎 **Premium Glassmorphic Dark UI**:
  - Modern design built with CSS Custom Properties, smooth gradients, subtle micro-animations, blur effects, and Google Fonts (`Outfit` & `Inter`).
- 🧹 **Automated Storage Management**:
  - Server-side auto-cleanup routine automatically deletes temporary uploads older than 10 minutes to save disk space.

---

## 🏗️ Project Architecture & Tech Stack

```
                     ┌──────────────────────────────────────────────┐
                     │          Web Browser Client (UI)             │
                     │  - HTML5 / CSS3 (Glassmorphism Theme)        │
                     │  - Custom JS Audio Recorder & Player         │
                     └──────────────────────┬───────────────────────┘
                                            │
                                  HTTP POST /api/clone
                                  (Multipart FormData)
                                            │
                                            ▼
                     ┌──────────────────────────────────────────────┐
                     │           Flask Backend (app.py)             │
                     │  - Upload handling & auto-cleanup            │
                     │  - Engine router (Fish API vs F5-TTS)        │
                     └──────────────┬────────────────┬──────────────┘
                                    │                │
            Fish Audio API Key      │                │  No API Key
                 Provided           │                │  (Fallback)
                                    ▼                ▼
                     ┌──────────────────┐    ┌──────────────────┐
                     │ Fish Audio API   │    │ Hugging Face     │
                     │ (S2-Pro Model)   │    │ (E2-F5-TTS Space)│
                     └──────────────────┘    └──────────────────┘
```

### **Technologies Used**
- **Backend**: Python 3.x, [Flask](https://flask.palletsprojects.com/), [Gradio Client](https://pypi.org/project/gradio-client/), [Requests](https://requests.readthedocs.io/)
- **Frontend**: Vanilla JavaScript (ES6+), HTML5 Semantic Tags, Modern CSS3 (CSS Variables, Keyframe Animations, Glassmorphism)
- **Design & Typography**: Google Fonts (`Outfit` & `Inter`), FontAwesome 6 Icons
- **AI Models**: Fish Audio (`s2-pro`), Hugging Face `abidlabs/E2-F5-TTS`

---

## 📂 Directory Structure

```
voice clone/
├── app.py                   # Main Flask backend application & API routes
├── README.md                # Project documentation & setup guide
├── static/
│   ├── css/
│   │   └── style.css        # Core design system & glassmorphism styling
│   ├── js/
│   │   └── app.js           # Client-side logic, WAV recorder, & UI controls
│   └── uploads/             # Temporary folder for audio processing (auto-cleaned)
└── templates/
    └── index.html           # Main web page application layout
```

---

## ⚙️ Installation & Setup

### **Prerequisites**
- **Python**: Version `3.8` or higher installed.
- **Browser**: Modern web browser (Google Chrome, Mozilla Firefox, Apple Safari, Microsoft Edge) with microphone permissions enabled.

### **Step-by-Step Setup**

1. **Clone or Navigate to Project Directory**:
   ```bash
   cd "/Users/mc/Desktop/voice clone"
   ```

2. **Create & Activate a Virtual Environment** *(Recommended)*:
   - **macOS / Linux**:
     ```bash
     python3 -m venv venv
     source venv/bin/activate
     ```
   - **Windows**:
     ```bash
     python -m venv venv
     venv\Scripts\activate
     ```

3. **Install Dependencies**:
   ```bash
   pip install flask gradio_client requests
   ```

4. **Run the Application**:
   ```bash
   python app.py
   ```

5. **Open in Browser**:
   Navigate to:
   ```
   http://localhost:5001
   ```
   *(Note: Port `5001` is used to prevent port conflicts with macOS AirPlay services).*

---

## 🚀 How to Use EchoClone AI

1. **Step 1: Provide Reference Voice**
   - Click **Record Voice** to capture 10–15 seconds of clear speech, **OR**
   - Click **Upload File** and drag & drop an existing audio recording (`MP3`, `WAV`, `M4A`, `WEBM`).

2. **Step 2: Enter Reference Transcript**
   - Type the **exact transcript** of what was spoken in the reference audio sample into the *"What was said in the voice sample?"* field. Accurately matching words ensures optimal voice cloning quality.

3. **Step 3: (Optional) Enter Fish Audio API Key**
   - For instant synthesis (1–2 seconds), enter your free API key from [fish.audio](https://fish.audio/go-api).
   - If left blank, the app automatically switches to the free Hugging Face F5-TTS engine (~60–90 seconds synthesis time).

4. **Step 4: Enter Target Speech Text**
   - Write the text you want your cloned voice to speak in the *"Text to Synthesize"* field.

5. **Step 5: Generate & Listen**
   - Click **Generate Cloned Speech**.
   - Track progress step-by-step. Once complete, use the custom audio player to preview, seek, or download your synthesized `.mp3` / `.wav` file!

---

## 📡 API Endpoint Reference

### **`POST /api/clone`**

Clones reference voice and generates speech for target text.

#### **Request (Multipart Form-Data)**
| Parameter | Type | Required | Description |
|---|---|---|---|
| `audio` | File | Yes | Audio file containing the reference voice sample. |
| `ref_text` | String | Yes | Exact text spoken in the reference audio file. |
| `gen_text` | String | Yes | Target text to be spoken by the cloned voice. |
| `fish_api_key` | String | No | Optional Fish Audio API Key for ultra-fast generation. |

#### **Response (JSON)**
- **Success (200 OK)**:
  ```json
  {
    "success": true,
    "audio_url": "/static/uploads/cloned_a1b2c3d4.mp3"
  }
  ```
- **Error (400 / 500)**:
  ```json
  {
    "success": false,
    "error": "Reference text (what you said in the audio) is required"
  }
  ```

---

## 💡 Technical Highlights & Gotchas

- **24kHz Sample Rate**: The client-side `WavRecorder` forces an `AudioContext` sample rate of 24,000 Hz to align with the training profile of modern zero-shot TTS models like F5-TTS for clearer audio quality.
- **Automatic Storage Management**: Files in `static/uploads/` older than 600 seconds (10 minutes) are purged on each request to prevent disk bloat.
- **Port 5001**: Default Flask port 5000 is often reserved by Control Center / AirPlay Receiver on macOS Monterey and later. Using `5001` ensures smooth startup without `Address already in use` errors.

---

## 📄 License & Credits

- **Engine Models**: [Fish Audio](https://fish.audio/) & [F5-TTS (abidlabs)](https://huggingface.co/spaces/abidlabs/E2-F5-TTS)
- **Icons & Styling**: [FontAwesome](https://fontawesome.com/) & Google Fonts
- Created with ❤️ for voice synthesis and audio AI experiments.
