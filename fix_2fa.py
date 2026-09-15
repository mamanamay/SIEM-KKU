import sqlite3
import os

db_path = 'backend/database.sqlite'
if not os.path.exists(db_path):
    print("Database not found!")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute("UPDATE user SET totpEnabled = 0, totpSecretEnc = NULL WHERE role = 'admin'")
print(f'Fixed {cursor.rowcount} admin users.')
conn.commit()
conn.close()
