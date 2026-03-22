# Gunicorn configuration file
import multiprocessing

# Timeout in seconds
timeout = 600

# Bind to 0.0.0.0:3000 (or use PORT env var if available)
bind = "0.0.0.0:3000"

# Workers
workers = multiprocessing.cpu_count() * 2 + 1
