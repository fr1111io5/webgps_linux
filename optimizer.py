import mysql.connector
import time
import json

db_config = {
    "host": "0.0.0.0",
    "user": "YOUR_MYSQL_USER",
    "password": "YOUR_MYSQL_PASSWORD",
    "database": "astromap"
}

def optimize_db():
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()
        
        # 1. Удаляем старые треки (старше 30 дней)
        cursor.execute("DELETE FROM tracks WHERE start_time < NOW() - INTERVAL 30 DAY")
        
    // 3. Оптимизация индексов (выполняется один раз)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_tracks_user ON tracks(user_login)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_markers_user ON markers(user_login)")
    
    conn.commit()
        print(f"[{time.strftime('%H:%M:%S')}] Database optimized successfully.")
        
        cursor.close()
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    print("AstroMAP Python Optimizer started...")
    while True:
        optimize_db()
        time.sleep(3600) # Запуск раз в час
