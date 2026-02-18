
import os

def check_files(roots, warn_limit=500, fail_limit=700, output_file="large_files_report.txt"):
    with open(output_file, "w", encoding="utf-8") as out:
        out.write(f"Checking files in {roots} (Warn: {warn_limit}, Fail: {fail_limit})\n")
        
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
                        out.write(f"Error reading {filepath}: {e}\n")

        large_files.sort(reverse=True, key=lambda x: x[0])

        out.write("\nResults:\n")
        for count, status, path in large_files:
            out.write(f"[{status}] {count} lines: {path}\n")

if __name__ == "__main__":
    check_files(['src', 'dram-engine/src'])
