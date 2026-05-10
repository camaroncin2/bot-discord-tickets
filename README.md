# Bot Discord Tickets

Bot de Discord con formularios, sistema de tickets con MongoDB Atlas y dashboard web local para configurar paneles visualmente.

## Requisitos

- Node.js 20 o superior.
- MongoDB Atlas o una instancia compatible con MongoDB.
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
MONGODB_URI=mongodb+srv://cretaniaserver_db_user:change_me@cluster0.ynm95c2.mongodb.net/?appName=Cluster0
MONGODB_DB_NAME=discord_bot
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
