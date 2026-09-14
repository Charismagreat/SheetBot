# EGDesk Development Context

This project is integrated with **EGDesk**.

## Server & Environment Guidelines
- **Port:** The development and hosting server port is **dynamic and variable** depending on the running environment.
- Do not assume or hardcode a specific port (such as 3000, 3002, or 4003).
- Always rely on dynamic request host headers (`request.headers.get("host")`) or user-specified URLs.

