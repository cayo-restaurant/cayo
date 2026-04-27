#!/usr/bin/env bash
# CAYO Site Agent — orchestrator. Runs the Python checker then the Node report.
set -euo pipefail

cd "$(dirname "$0")"

echo "==> [1/5] Ensuring dependencies"
python3 -c "from PIL import Image" 2>/dev/null || pip3 install --break-system-packages --quiet Pillow
python3 -c "import docx" 2>/dev/null || pip3 install --break-system-packages --quiet python-docx

echo "==> [2/5] Running live-site checks (agent.py)"
python3 agent.py

echo "==> [3/5] Running static code review (code_review.py)"
python3 code_review.py

echo "==> [4/5] Probing API surface (api_probe.py)"
python3 api_probe.py

echo "==> [5/5] Generating Word report"
python3 generate_report.py

echo "==> Done."
ls -lh reports/cayo-site-report-latest.docx
