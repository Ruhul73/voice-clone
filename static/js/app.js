// Global error logger for remote diagnostics
window.onerror = function(message, source, lineno, colno, error) {
    alert("JS Error: " + message + "\nFile: " + source + "\nLine: " + lineno + " Col: " + colno);
    return false;
};

// --- WAV Recorder Helper Class ---
class WavRecorder {
    constructor(audioContext) {
        this.context = audioContext;
        this.bufferSize = 2048;
        this.leftchannel = [];
        this.recordingLength = 0;
        this.sampleRate = this.context.sampleRate;
        this.isRecording = false;
    }

    record(stream) {
        this.leftchannel = [];
        this.recordingLength = 0;
        
        this.volume = this.context.createGain();
        this.audioInput = this.context.createMediaStreamSource(stream);
        this.audioInput.connect(this.volume);
        
        // Create ScriptProcessorNode (mono channel)
        this.recorder = this.context.createScriptProcessor(this.bufferSize, 1, 1);
        
        this.recorder.onaudioprocess = (e) => {
            if (!this.isRecording) return;
            const left = e.inputBuffer.getChannelData(0);
            this.leftchannel.push(new Float32Array(left));
            this.recordingLength += this.bufferSize;
        };
        
        this.volume.connect(this.recorder);
        this.recorder.connect(this.context.destination);
        this.isRecording = true;
    }

    stop() {
        this.isRecording = false;
        
        // Disconnect audio nodes
        if (this.audioInput) this.audioInput.disconnect();
        if (this.recorder) this.recorder.disconnect();
        
        // Flatten leftchannel buffer
        const leftBuffer = this.flattenChannel(this.leftchannel, this.recordingLength);
        
        // Encode to WAV format
        const wavBuffer = this.encodeWAV(leftBuffer);
        return new Blob([wavBuffer], { type: 'audio/wav' });
    }

    flattenChannel(channelBuffer, recordingLength) {
        const result = new Float32Array(recordingLength);
        let offset = 0;
        for (let i = 0; i < channelBuffer.length; i++) {
            result.set(channelBuffer[i], offset);
            offset += channelBuffer[i].length;
        }
        return result;
    }

    encodeWAV(samples) {
        const buffer = new ArrayBuffer(44 + samples.length * 2);
        const view = new DataView(buffer);
        
        /* RIFF identifier */
        this.writeString(view, 0, 'RIFF');
        /* file length */
        view.setUint32(4, 36 + samples.length * 2, true);
        /* RIFF type */
        this.writeString(view, 8, 'WAVE');
        /* format chunk identifier */
        this.writeString(view, 12, 'fmt ');
        /* format chunk length */
        view.setUint32(16, 16, true);
        /* sample format (raw PCM) */
        view.setUint16(20, 1, true);
        /* channel count (mono) */
        view.setUint16(22, 1, true);
        /* sample rate */
        view.setUint32(24, this.sampleRate, true);
        /* byte rate (sample rate * block align) */
        view.setUint32(28, this.sampleRate * 2, true);
        /* block align (channel count * bytes per sample) */
        view.setUint16(32, 2, true);
        /* bits per sample */
        view.setUint16(34, 16, true);
        /* data chunk identifier */
        this.writeString(view, 36, 'data');
        /* data chunk length */
        view.setUint32(40, samples.length * 2, true);
        
        this.floatTo16BitPCM(view, 44, samples);
        
        return buffer;
    }

    floatTo16BitPCM(output, offset, input) {
        for (let i = 0; i < input.length; i++, offset += 2) {
            let s = Math.max(-1, Math.min(1, input[i]));
            output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }
    }

    writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // --- State Variables ---
    let audioContext = null;
    let wavRecorder = null;
    let micStream = null;
    let recordedBlob = null;
    let uploadedFile = null;
    let recordingTimerInterval = null;
    let recordingSeconds = 0;
    let isRecording = false;

    // --- DOM Elements ---
    // Tabs
    const tabRecord = document.getElementById('tab-record');
    const tabUpload = document.getElementById('tab-upload');
    const contentRecord = document.getElementById('content-record');
    const contentUpload = document.getElementById('content-upload');

    // Recorder
    const btnRecordToggle = document.getElementById('btn-record-toggle');
    const audioWave = document.getElementById('audio-wave');
    const recordingTimer = document.getElementById('recording-timer');
    const recordStatus = document.getElementById('record-status');

    // Upload
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const selectedFileBadge = document.getElementById('selected-file-info');
    const selectedFileName = document.getElementById('selected-file-name');
    const btnRemoveFile = document.getElementById('btn-remove-file');

    // Previews & Inputs
    const refAudioPreview = document.getElementById('ref-audio-preview');
    const refAudioPlayer = document.getElementById('ref-audio-player');
    const refText = document.getElementById('ref-text');
    const fishApiKey = document.getElementById('fish-api-key');
    const genText = document.getElementById('gen-text');
    const charCounter = document.getElementById('char-counter');

    // Action Button
    const btnGenerate = document.getElementById('btn-generate');
    const btnText = document.getElementById('btn-text');
    const btnSpinner = document.getElementById('btn-spinner');

    // Progress & Output
    const progressBox = document.getElementById('progress-box');
    const stepUpload = document.getElementById('step-upload');
    const stepConnect = document.getElementById('step-connect');
    const stepSynthesize = document.getElementById('step-synthesize');
    const resultBox = document.getElementById('result-box');

    // Custom Player
    const outputAudioPlayer = document.getElementById('output-audio-player');
    const playerPlayBtn = document.getElementById('player-play-btn');
    const playerProgress = document.getElementById('player-progress');
    const playerProgressContainer = playerProgress.parentElement;
    const playerTime = document.getElementById('player-time');
    const playerDownloadBtn = document.getElementById('player-download-btn');

    // --- Tab Switching ---
    tabRecord.addEventListener('click', () => {
        tabRecord.classList.add('active');
        tabUpload.classList.remove('active');
        contentRecord.classList.add('active');
        contentUpload.classList.remove('active');
        // Clear uploaded file if switching
        clearUploadedFile();
        updateGenerateButtonState();
    });

    tabUpload.addEventListener('click', () => {
        tabUpload.classList.add('active');
        tabRecord.classList.remove('active');
        contentUpload.classList.add('active');
        contentRecord.classList.remove('active');
        // Stop recording if active and clear
        if (isRecording) {
            stopRecording(false); // Discard
        }
        clearRecordedAudio();
        updateGenerateButtonState();
    });

    // --- WavRecorder: Recording Voice ---
    btnRecordToggle.addEventListener('click', () => {
        if (!isRecording) {
            startRecording();
        } else {
            stopRecording(true); // Save
        }
    });

    async function startRecording() {
        try {
            // Initialize AudioContext on user gesture (forcing 24000Hz to match F5-TTS training profile)
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)({
                    sampleRate: 24000
                });
            }
            if (audioContext.state === 'suspended') {
                await audioContext.resume();
            }

            micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            wavRecorder = new WavRecorder(audioContext);
            wavRecorder.record(micStream);

            isRecording = true;
            btnRecordToggle.classList.add('recording');
            audioWave.classList.add('recording');
            recordStatus.textContent = 'Recording... click to stop';
            
            // Start Timer
            recordingSeconds = 0;
            recordingTimer.textContent = '00:00';
            recordingTimerInterval = setInterval(() => {
                recordingSeconds++;
                const mins = String(Math.floor(recordingSeconds / 60)).padStart(2, '0');
                const secs = String(recordingSeconds % 60).padStart(2, '0');
                recordingTimer.textContent = `${mins}:${secs}`;
            }, 1000);

        } catch (err) {
            console.error('Microphone access denied or error:', err);
            alert('Could not access microphone. Please ensure microphone permissions are granted.');
            recordStatus.textContent = 'Microphone access failed';
        }
    }

    function stopRecording(save = true) {
        if (!wavRecorder || !isRecording) return;
        
        clearInterval(recordingTimerInterval);
        recordedBlob = wavRecorder.stop();
        isRecording = false;
        
        btnRecordToggle.classList.remove('recording');
        audioWave.classList.remove('recording');
        recordStatus.textContent = save ? 'Recording saved!' : 'Click to start recording';
        
        // Stop microphone stream tracks to release device
        if (micStream) {
            micStream.getTracks().forEach(track => track.stop());
            micStream = null;
        }
        
        if (save) {
            const audioUrl = URL.createObjectURL(recordedBlob);
            refAudioPlayer.src = audioUrl;
            refAudioPreview.style.display = 'block';
            updateGenerateButtonState();
        } else {
            clearRecordedAudio();
        }
    }

    function clearRecordedAudio() {
        recordedBlob = null;
        refAudioPlayer.src = '';
        refAudioPreview.style.display = 'none';
        recordingTimer.textContent = '00:00';
    }

    // --- File Upload Logic ---
    // Drag & Drop
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
        }, false);
    });

    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            handleUploadedFile(files[0]);
        }
    });

    dropZone.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            handleUploadedFile(fileInput.files[0]);
        }
    });

    function handleUploadedFile(file) {
        if (!file.type.startsWith('audio/')) {
            alert('Please select a valid audio file.');
            return;
        }
        
        uploadedFile = file;
        selectedFileName.textContent = file.name;
        selectedFileBadge.style.display = 'flex';
        dropZone.style.display = 'none';

        // Set up player preview
        const fileUrl = URL.createObjectURL(file);
        refAudioPlayer.src = fileUrl;
        refAudioPreview.style.display = 'block';
        
        updateGenerateButtonState();
    }

    btnRemoveFile.addEventListener('click', (e) => {
        e.stopPropagation(); // Stop click triggering dropzone click
        clearUploadedFile();
        updateGenerateButtonState();
    });

    function clearUploadedFile() {
        uploadedFile = null;
        fileInput.value = '';
        selectedFileBadge.style.display = 'none';
        dropZone.style.display = 'flex';
        refAudioPlayer.src = '';
        refAudioPreview.style.display = 'none';
    }

    // --- Form Verification & State Management ---
    refText.addEventListener('input', updateGenerateButtonState);
    genText.addEventListener('input', () => {
        charCounter.textContent = genText.value.length;
        updateGenerateButtonState();
    });

    function updateGenerateButtonState() {
        const hasAudio = (recordedBlob !== null) || (uploadedFile !== null);
        const hasRefText = refText.value.trim().length > 0;
        const hasGenText = genText.value.trim().length > 0;

        btnGenerate.disabled = !(hasAudio && hasRefText && hasGenText);
    }

    // --- Voice Cloning API Call & Progress Animations ---
    btnGenerate.addEventListener('click', async () => {
        const audioToSend = recordedBlob || uploadedFile;
        const referenceTextValue = refText.value.trim();
        const targetTextValue = genText.value.trim();

        if (!audioToSend || !referenceTextValue || !targetTextValue) return;

        // Reset UI Output
        resultBox.style.display = 'none';
        outputAudioPlayer.src = '';
        
        // Show Progress steps
        progressBox.style.display = 'flex';
        resetProgressSteps();
        
        // Disable UI controls during process
        setFormControlsDisabled(true);

        const formData = new FormData();
        // Give recorded file a custom wav name, otherwise use uploaded file's original name
        const filename = recordedBlob ? 'recorded_mic.wav' : audioToSend.name;
        formData.append('audio', audioToSend, filename);
        formData.append('ref_text', referenceTextValue);
        formData.append('gen_text', targetTextValue);
        if (fishApiKey && fishApiKey.value.trim()) {
            formData.append('fish_api_key', fishApiKey.value.trim());
        }

        // Animate progress steps mock progression
        let stepInterval = simulateProgressSteps();

        try {
            const response = await fetch('/api/clone', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            clearInterval(stepInterval);

            if (data.success) {
                // Complete all steps in UI
                markStepComplete(stepUpload);
                markStepComplete(stepConnect);
                markStepComplete(stepSynthesize);
                
                setTimeout(() => {
                    progressBox.style.display = 'none';
                    // Load the resulting audio into the custom player
                    outputAudioPlayer.src = data.audio_url;
                    playerDownloadBtn.href = data.audio_url;
                    resultBox.style.display = 'flex';
                    setFormControlsDisabled(false);
                }, 800);

            } else {
                throw new Error(data.error || 'Server returned an error');
            }

        } catch (err) {
            clearInterval(stepInterval);
            console.error('Error synthesis:', err);
            alert(`Voice synthesis failed: ${err.message}`);
            progressBox.style.display = 'none';
            setFormControlsDisabled(false);
        }
    });

    // Helper functions for progress animation
    function resetProgressSteps() {
        [stepUpload, stepConnect, stepSynthesize].forEach(step => {
            step.className = 'progress-step';
            step.querySelector('.step-icon').className = 'fa-regular fa-circle step-icon';
        });
        stepUpload.classList.add('active');
        stepUpload.querySelector('.step-icon').className = 'fa-solid fa-circle-notch fa-spin step-icon';
    }

    function markStepComplete(stepElement) {
        stepElement.className = 'progress-step complete';
        stepElement.querySelector('.step-icon').className = 'fa-solid fa-circle-check step-icon';
    }

    function markStepActive(stepElement) {
        stepElement.className = 'progress-step active';
        stepElement.querySelector('.step-icon').className = 'fa-solid fa-circle-notch fa-spin step-icon';
    }

    function simulateProgressSteps() {
        let elapsed = 0;
        return setInterval(() => {
            elapsed += 500;
            if (elapsed === 1500) {
                // Step 1 done, Step 2 active
                markStepComplete(stepUpload);
                markStepActive(stepConnect);
            } else if (elapsed === 4500) {
                // Step 2 done, Step 3 active
                markStepComplete(stepConnect);
                markStepActive(stepSynthesize);
            }
        }, 500);
    }

    function setFormControlsDisabled(disabled) {
        refText.disabled = disabled;
        genText.disabled = disabled;
        if (fishApiKey) fishApiKey.disabled = disabled;
        tabRecord.disabled = disabled;
        tabUpload.disabled = disabled;
        btnRecordToggle.disabled = disabled;
        btnRemoveFile.disabled = disabled;
        btnGenerate.disabled = disabled;
        
        if (disabled) {
            btnText.style.display = 'none';
            btnSpinner.style.display = 'block';
        } else {
            btnText.style.display = 'inline-flex';
            btnSpinner.style.display = 'none';
            updateGenerateButtonState();
        }
    }

    // --- Custom Audio Player UI Logic ---
    playerPlayBtn.addEventListener('click', () => {
        if (outputAudioPlayer.paused) {
            outputAudioPlayer.play();
            playerPlayBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
        } else {
            outputAudioPlayer.pause();
            playerPlayBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
        }
    });

    outputAudioPlayer.addEventListener('timeupdate', () => {
        const duration = outputAudioPlayer.duration || 0;
        const currentTime = outputAudioPlayer.currentTime || 0;
        
        // Progress bar percentage
        if (duration > 0) {
            const pct = (currentTime / duration) * 100;
            playerProgress.style.width = `${pct}%`;
        } else {
            playerProgress.style.width = '0%';
        }

        // Time indicators
        playerTime.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
    });

    outputAudioPlayer.addEventListener('ended', () => {
        playerPlayBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
        playerProgress.style.width = '0%';
    });

    // Seek/Click progress bar to jump time
    playerProgressContainer.addEventListener('click', (e) => {
        const duration = outputAudioPlayer.duration;
        if (!duration) return;
        
        const rect = playerProgressContainer.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const width = rect.width;
        
        const targetPct = clickX / width;
        outputAudioPlayer.currentTime = targetPct * duration;
    });

    function formatTime(secs) {
        if (isNaN(secs)) return '00:00';
        const mins = String(Math.floor(secs / 60)).padStart(2, '0');
        const seconds = String(Math.floor(secs % 60)).padStart(2, '0');
        return `${mins}:${seconds}`;
    }
});
