FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
ARG INSTALL_SHADOW_RUNTIME=false
COPY requirements-models.txt .
RUN if [ "$INSTALL_SHADOW_RUNTIME" = "true" ]; then pip install --no-cache-dir -r requirements-models.txt; fi

COPY . .
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN useradd --uid 10001 --create-home siem
USER siem

EXPOSE 8100

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8100", "--limit-concurrency", "16", "--backlog", "32", "--timeout-keep-alive", "5"]
