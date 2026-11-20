FROM python:3.12-alpine
WORKDIR /app
COPY agent.py ./
# Runs as root: reading other processes' /proc/<pid>/fd needs it (plus SYS_PTRACE).
CMD ["python", "-u", "agent.py"]
