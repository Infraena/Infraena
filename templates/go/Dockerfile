FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod ./
RUN go mod download
COPY . .
RUN go build -o app .

FROM alpine:3.20
WORKDIR /app
COPY --from=builder /app/app .
EXPOSE 3000
CMD ["./app"]
