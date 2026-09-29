import os
import glob

src_dir = 'src'
files_to_check = glob.glob(f'{src_dir}/**/*.ts', recursive=True)

modified_files = []

for file_path in files_to_check:
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    if "from 'bcrypt'" in content:
        new_content = content.replace("from 'bcrypt'", "from 'bcryptjs'")
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        modified_files.append(file_path)

print(f"Updated imports in {len(modified_files)} files: {', '.join(modified_files)}")
