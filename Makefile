.PHONY: all agent agent-windows relay web dev clean

all: agent relay web

agent:
	cd agent && go build -o ../bin/rttys-agent .

agent-windows:
	cd agent && GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -o ../bin/rttys-agent.exe .

relay:
	cd packages/relay && npm run build

web:
	cd packages/web && npm run build
	rm -rf packages/relay/public
	cp -r packages/web/dist packages/relay/public

dev:
	@echo "Start in three terminals:"
	@echo "  1) cd packages/relay && npm run dev"
	@echo "  2) cd packages/web && npm run dev"
	@echo "  3) cd agent && go run . -relay ws://localhost:8080/ws/agent"

clean:
	rm -rf bin/ packages/relay/dist packages/web/dist packages/relay/public
