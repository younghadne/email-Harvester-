import os
import zipfile

def make_zip():
    output_filename = "public/email-harvester.zip"
    os.makedirs("public", exist_ok=True)
    
    # Files and folders to include
    include_paths = [
        "package.json",
        "tsconfig.json",
        "vite.config.ts",
        "index.html",
        "server.ts",
        "README.md",
        "run.sh",
        "requirements.txt",
        "rap-blog-seeds.txt",
        "metadata.json",
        ".env.example",
        "src",
        "desktop",
    ]
    
    with zipfile.ZipFile(output_filename, "w", zipfile.ZIP_DEFLATED) as zf:
        for item in include_paths:
            if not os.path.exists(item):
                continue
            if os.path.isfile(item):
                zf.write(item, os.path.join("email-harvester", item))
            elif os.path.isdir(item):
                for root, dirs, files in os.walk(item):
                    # Skip unwanted directories
                    dirs[:] = [d for d in dirs if d not in ["node_modules", ".git", "dist", "__pycache__"]]
                    for file in files:
                        if file.endswith((".pyc", ".DS_Store")):
                            continue
                        file_path = os.path.join(root, file)
                        arcname = os.path.join("email-harvester", file_path)
                        zf.write(file_path, arcname)
                        
    # Also copy to root for direct access
    import shutil
    shutil.copyfile(output_filename, "email-harvester.zip")
    
    size_mb = os.path.getsize(output_filename) / (1024 * 1024)
    print(f"Zip created: {output_filename} ({size_mb:.2f} MB)")

if __name__ == "__main__":
    make_zip()
