# Example Chat Lean4

Servidor de chat multi-cliente em WebSocket escrito em Lean 4 usando a biblioteca experimental [`websocket.lean`](https://github.com/cleissonbarbosa/websocket.lean).

## ✨ Funcionalidades
* Broadcast de mensagens de texto entre todos os clientes.
* Comandos:
	* `/nick NovoNome` altera o apelido.
	* `/who` lista usuários conectados.
	* `/me ação` envia linha de ação / emote.
* Mensagens de entrada / saída de usuários.
* Limite de tamanho de mensagem (2000 chars) com aviso ao exceder.
* Subprotocolo WebSocket configurável (usa `chat`).
* Keep-alive por pings (intervalo configurável) e contagem de pongs perdidos.
* Logging estruturado via `WebSocket.Log` (módulo "Chat").

## 🛠 Stack
* Lean 4 (toolchain: `leanprover/lean4:v4.21.0` conforme `lean-toolchain`).
* Lake (gerenciador de build / dependências).
* Dependência externa: `websocket` (rev `v0.1.3`).

## 📦 Estrutura Principal
```
ExampleChatLean4/
	ChatServer.lean   -- lógica do servidor e handler de eventos
ExampleChatLean4.lean -- raiz da lib (pode agregar outros módulos)
Main.lean            -- ponto de entrada: inicia servidor de chat
lakefile.toml        -- config Lake + dependências
```

## 🚀 Executar
Construir e rodar:
```bash
lake build
./.lake/build/bin/example-chat-lean4
```
O servidor sobe na porta `9101` (configure em `ChatServer.lean`).

Conectar com um cliente WebSocket (exemplos):
```bash
# Usando wscat
wscat -c ws://localhost:9101

# Usando websocat
websocat ws://localhost:9101
```

Teste alguns comandos após conectar:
```
/nick Alice
/me acena
/who
Olá pessoal!
```

## ⚙️ Configuração do Servidor
A estrutura `ServerConfig` (em `ChatServer.lean`) define:
```lean
{ port := 9101,
	maxConnections := 200,
	pingInterval := 20,      -- segundos entre pings
	maxMissedPongs := 2,     -- tolerância de pongs perdidos
	maxMessageSize := 512 * 1024,
	subprotocols := ["chat"] }
```
Altere valores conforme necessidade e recompile.

## 🔄 Ciclo de Desenvolvimento
```bash
# Atualizar dependências (se mudar lakefile)
lake update

# Build incremental
lake build

# Limpar build
lake clean
```

## 🧪 Ideias de Teste Manual
1. Abrir 2+ clientes, trocar `/nick` e mandar mensagens.
2. Enviar mensagem > 2000 chars e observar aviso.
3. Fechar um cliente e ver mensagem de saída.
4. Enviar `/me dança` e conferir formatação.

## 📌 Próximos Passos Sugeridos
* Adicionar testes automatizados (ex.: simular conexões usando camada de transporte mock da lib WebSocket).
* Persistir histórico (ex.: em arquivo ou memória circular).
* Suporte a múltiplas salas / canais.
* Comando `/msg <nick> <texto>` para mensagem privada.
* Exportar métricas (quantidade de usuários, mensagens, pings enviados).

## 📝 Licença
Projeto exemplo educacional; reutilize livremente. A biblioteca `websocket.lean` segue a licença MIT (ver repositório upstream).

---
Se encontrar problemas ou quiser expandir, abra uma issue ou adapte o código direto. Bom hacking em Lean! 🧠