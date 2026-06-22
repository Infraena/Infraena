import os
from fastapi import FastAPI

app = FastAPI(title="{{serviceName}}")

@app.get("/")
async def root():
    return {"service": "{{serviceName}}", "status": "ok"}

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 3000))
    uvicorn.run(app, host="0.0.0.0", port=port)
