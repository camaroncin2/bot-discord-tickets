# Bot Discord Tickets

Bot de Discord con formularios, sistema de tickets con MySQL/MariaDB y dashboard web local para configurar paneles visualmente.

## Requisitos

- Node.js 20 o superior.
- MySQL o MariaDB local.
- Una aplicacion de Discord con bot token y client ID.

## Configuracion

1. Instala dependencias:

```bash
npm install
```

2. Copia `.env.example` a `.env` y completa tus valores:

```env
DISCORD_TOKEN=your_discord_bot_token
CLIENT_ID=your_discord_application_id
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=change_me
DB_NAME=discord_bot
WEB_PORT=3000
WEB_PASSWORD=change_me
SESSION_SECRET=change_me_to_a_long_random_text
```

Tambien puedes copiar `config.example.json` a `config.json` para usar configuracion local, pero `.env` es la opcion recomendada.

## Inicio

En Windows puedes usar:

```bat
iniciar-bot.bat
```

O iniciar directamente:

```bash
npm start
```

La web local queda disponible por defecto en:

```text
http://localhost:3000
```

## Seguridad

No subas `.env`, `config.json` ni `guild-config.json` a repositorios publicos. Estos archivos pueden contener tokens, contrasenas o IDs privados de tu servidor.
