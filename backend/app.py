from flask import Flask, request, jsonify
from flask_cors import CORS
from openai import OpenAI
import os
import mysql.connector
from datetime import datetime
import logging

app = Flask(__name__)
CORS(app)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

client = OpenAI(api_key="")

db_config = {
    'host': '',
    'user': '',
    'password': '',
    'database': 'peppypick'
}

def get_db_connection():
    try:
        conn = mysql.connector.connect(**db_config)
        logging.info("Database connection established successfully")
        return conn
    except mysql.connector.Error as err:
        logging.error(f"Error connecting to database: {err}")
        raise

conn = get_db_connection()
cursor = conn.cursor()
cursor.execute("""
CREATE TABLE IF NOT EXISTS videochat_data (
    id INT AUTO_INCREMENT PRIMARY KEY,
    filename VARCHAR(255),
    data_type ENUM('video', 'user', 'ai') NOT NULL,
    content TEXT NOT NULL,
    timestamp DATETIME NOT NULL
);
""")
               
@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.json
    messages = data.get('messages', [])

    logging.info(f"Received chat request with {len(messages)} messages")

    try:
        response = client.chat.completions.create(
            model="gpt-4",
            messages=messages,
            max_tokens=200,
            temperature=0.7,
        )
        ai_message = response.choices[0].message.content
        
        # Save the chat message to the database
        save_to_database(None, "ai", ai_message)
        
        logging.info("AI response generated and saved to database")
        return jsonify({"message": ai_message})
    except Exception as e:
        logging.error(f"Error in chat endpoint: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/save-video', methods=['POST'])
def save_video():
    if 'video' not in request.files:
        logging.warning("No video file provided in the request")
        return jsonify({"error": "No video file provided"}), 400

    video_file = request.files['video']
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"video_{timestamp}.webm"
    video_path = os.path.join('videos', filename)

    try:
        os.makedirs('videos', exist_ok=True)

        video_file.save(video_path)
        logging.info(f"Video file saved: {video_path}")

        save_to_database(filename, "video", video_path)
        logging.info("Video metadata saved to database")

        return jsonify({"message": "Video saved successfully"}), 200
    except Exception as e:
        logging.error(f"Error saving video: {str(e)}")
        return jsonify({"error": f"Error saving video: {str(e)}"}), 500

@app.route('/api/save-chat', methods=['POST'])
def save_chat():
    data = request.json
    chat_history = data.get('chatHistory', [])

    logging.info(f"Received request to save chat history with {len(chat_history)} messages")

    try:
        for message in chat_history:
            save_to_database(None, message['role'], message['content'])
        logging.info("Chat history saved successfully")
        return jsonify({"message": "Chat history saved successfully"}), 200
    except Exception as e:
        logging.error(f"Error saving chat history: {str(e)}")
        return jsonify({"error": f"Database error: {str(e)}"}), 500

def save_to_database(filename, data_type, content):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        query = "INSERT INTO videochat_data (filename, data_type, content, timestamp) VALUES (%s, %s, %s, %s)"
        values = (filename, data_type, content, datetime.now())
        cursor.execute(query, values)
        conn.commit()
        logging.info(f"Data saved to database: type={data_type}, filename={filename}")
    except mysql.connector.Error as err:
        logging.error(f"Database error: {err}")
        raise
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

if __name__ == '__main__':
    app.run(debug=True)