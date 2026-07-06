FROM node:20-alpine

# Instalamos fuentes básicas para que Sharp pueda renderizar texto correctamente en SVG
RUN apk add --no-cache fontconfig ttf-dejavu

WORKDIR /app

# Copiamos los archivos de dependencias
COPY package*.json ./

# Instalamos las dependencias
RUN npm install

# Copiamos el código fuente de la app
COPY bot.js .

# Creamos la carpeta templates (aunque el volumen de docker-compose la sobrescribirá si se monta)
RUN mkdir -p templates

# Ejecutamos el bot
CMD ["npm", "start"]
