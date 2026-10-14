FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.lock pyproject.toml ./
RUN pip install --no-cache-dir -r requirements.lock
COPY finscope ./finscope
COPY web ./web
RUN pip install --no-cache-dir --no-deps . && useradd --uid 10001 --create-home researcher && mkdir /app/runs && chown researcher /app/runs
USER researcher
EXPOSE 8772
CMD ["python", "-m", "uvicorn", "finscope.api:app", "--host", "0.0.0.0", "--port", "8772", "--workers", "1"]
