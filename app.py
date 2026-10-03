import os
import uuid
import shutil
import time
import requests
from flask import Flask, request, jsonify, render_template, send_from_directory
from gradio_client import Client, handle_file

app = Flask(__name__)

# Configure directories
UPLOAD_FOLDER = os.path.join(app.root_path, 'static', 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Target Hugging Face space for F5-TTS
HF_SPACE = "abidlabs/E2-F5-TTS"

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/clone', methods=['POST'])
def clone_voice():
    # 1. Clean up old files (older than 10 minutes) to save space
    try:
        now = time.time()
        for filename in os.listdir(UPLOAD_FOLDER):
            filepath = os.path.join(UPLOAD_FOLDER, filename)
            if os.path.isfile(filepath):
                # If file is older than 600 seconds (10 mins), delete it
                if os.stat(filepath).st_mtime < now - 600:
                    os.remove(filepath)
    except Exception as e:
        print(f"Error during file cleanup: {e}")

    # 2. Extract parameters from the request
    if 'audio' not in request.files:
        return jsonify({'success': False, 'error': 'No audio file provided'}), 400
        
    audio_file = request.files['audio']
    ref_text = request.form.get('ref_text', '').strip()
    gen_text = request.form.get('gen_text', '').strip()
    fish_api_key = request.form.get('fish_api_key', '').strip()
    
    if not ref_text:
        return jsonify({'success': False, 'error': 'Reference text (what you said in the audio) is required'}), 400
    if not gen_text:
        return jsonify({'success': False, 'error': 'Target text (what you want the voice to say) is required'}), 400

    # 3. Save the uploaded reference audio file locally
    file_ext = os.path.splitext(audio_file.filename)[1] or '.wav'
    ref_filename = f"ref_{uuid.uuid4().hex}{file_ext}"
    ref_filepath = os.path.join(UPLOAD_FOLDER, ref_filename)
    audio_file.save(ref_filepath)

    try:
        # Check if Fish Audio API Key is provided for fast/high-similarity cloning
        if fish_api_key:
            print("Using Fish Audio API for fast voice cloning...")
            headers = {
                "Authorization": f"Bearer {fish_api_key}"
            }
            
            # Create a voice model
            url_create = "https://api.fish.audio/model"
            with open(ref_filepath, "rb") as audio_binary:
                files = {
                    "voices": (ref_filename, audio_binary, f"audio/{file_ext.lstrip('.')}")
                }
                data = {
                    "title": f"Voice_{uuid.uuid4().hex[:8]}",
                    "visibility": "private",
                    "type": "tts",
                    "train_mode": "fast",
                    "enhance_audio_quality": "true"  # Automatically clean and enhance the voice recording
                }
                create_res = requests.post(url_create, headers=headers, files=files, data=data)
                
            if create_res.status_code != 201:
                raise Exception(f"Failed to create Fish Audio model: {create_res.text}")
                
            voice_model_id = create_res.json().get("id")
            if not voice_model_id:
                raise Exception("No voice model ID returned by Fish Audio.")
                
            # Convert text to speech using this model
            url_tts = "https://api.fish.audio/v1/tts"
            json_data = {
                "text": gen_text,
                "reference_id": voice_model_id,
                "format": "mp3"
            }
            headers_tts = {
                "Authorization": f"Bearer {fish_api_key}",
                "Content-Type": "application/json",
                "model": "s2-pro"  # Use S2-Pro flagship model for maximum similarity
            }
            
            tts_res = requests.post(url_tts, headers=headers_tts, json=json_data)
            if tts_res.status_code != 200:
                raise Exception(f"Fish Audio TTS conversion failed: {tts_res.text}")
                
            out_filename = f"cloned_{uuid.uuid4().hex}.mp3"
            out_filepath = os.path.join(UPLOAD_FOLDER, out_filename)
            with open(out_filepath, "wb") as f_out:
                f_out.write(tts_res.content)
                
            # Clean up the local uploaded reference audio
            try:
                os.remove(ref_filepath)
            except Exception:
                pass
                
            return jsonify({
                'success': True,
                'audio_url': f'/static/uploads/{out_filename}'
            })
            
        else:
            # Fallback to free CPU-based Hugging Face F5-TTS
            print(f"Connecting to Hugging Face Space: {HF_SPACE}...")
            client = Client(HF_SPACE)
            
            print("Sending request to F5-TTS API...")
            # Call the '/infer' API on F5-TTS space
            result = client.predict(
                ref_audio_orig=handle_file(ref_filepath),
                ref_text=ref_text,
                gen_text=gen_text,
                exp_name="F5-TTS",
                remove_silence=False,
                cross_fade_duration=0.15,
                api_name="/infer"
            )
            
            # The result is a tuple (synthesized_audio_path, spectrogram_image_path)
            synthesized_audio_temp_path = result[0]
            
            if not synthesized_audio_temp_path or not os.path.exists(synthesized_audio_temp_path):
                raise Exception("Failed to generate audio from Hugging Face space.")
                
            # Copy the synthesized file to our local uploads directory
            out_filename = f"cloned_{uuid.uuid4().hex}.wav"
            out_filepath = os.path.join(UPLOAD_FOLDER, out_filename)
            shutil.copy(synthesized_audio_temp_path, out_filepath)
            
            # Clean up the local uploaded reference audio to free up space
            try:
                os.remove(ref_filepath)
            except Exception:
                pass
    
            return jsonify({
                'success': True,
                'audio_url': f'/static/uploads/{out_filename}'
            })

    except Exception as e:
        print(f"Error during voice cloning: {e}")
        # Clean up reference file on failure
        try:
            if os.path.exists(ref_filepath):
                os.remove(ref_filepath)
        except Exception:
            pass
        return jsonify({'success': False, 'error': f"Voice cloning failed: {str(e)}"}), 500

if __name__ == '__main__':
    # Use port 5001 to avoid common conflicts (like AirPlay on Mac using 5000)
    app.run(host='0.0.0.0', port=5001, debug=True)
