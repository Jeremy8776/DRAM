
import os

def check_files(roots, warn_limit=500, fail_limit=700):
    print(f"Checking files in {roots} (Warn: {warn_limit}, Fail: {fail_limit})")
    
    large_files = []

    for root_dir in roots:
        for root, dirs, files in os.walk(root_dir):
            if "node_modules" in dirs:
                dirs.remove("node_modules")
            if ".git" in dirs:
                dirs.remove(".git")
                
            for file in files:
                if not file.endswith(('.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs', '.css', '.html')):
                    continue
                    
                filepath = os.path.join(root, file)
                try:
                    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                        lines = len(f.readlines())
                        if lines > warn_limit:
                            status = "FAIL" if lines > fail_limit else "WARN"
                            large_files.append((lines, status, filepath))
                except Exception as e:
                    print(f"Error reading {filepath}: {e}")

    large_files.sort(reverse=True, key=lambda x: x[0])

    print("\nResults:")
    for count, status, path in large_files:
        print(f"[{status}] {count} lines: {path}")

if __name__ == "__main__":
    check_files(['src', 'dram-engine/src'])
