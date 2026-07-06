const { Telegraf, session } = require('telegraf');
const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
require('dotenv').config();

const token = process.env.TELEGRAM_TOKEN;
if (!token) {
    console.error('ERROR: TELEGRAM_TOKEN no está definido en el archivo .env');
    process.exit(1);
}

const bot = new Telegraf(token);
const TEMPLATES_DIR = path.join(__dirname, 'templates');

// Usamos el middleware session de Telegraf para guardar el estado de cada chat
bot.use(session());

// Función auxiliar para extraer variables de la plantilla SVG (formato {{Variable}})
const extractVariables = (svgContent) => {
    const regex = /\{\{([^}]+)\}\}/g;
    const variables = new Set();
    let match;
    while ((match = regex.exec(svgContent)) !== null) {
        variables.add(match[1].trim());
    }
    return Array.from(variables);
};

bot.command('start', async (ctx) => {
    try {
        // Leemos la carpeta de plantillas
        const files = await fs.readdir(TEMPLATES_DIR);
        const svgFiles = files.filter(file => file.endsWith('.svg'));

        if (svgFiles.length === 0) {
            return ctx.reply('No se encontraron plantillas en la carpeta /templates.');
        }

        // Creamos botones inline para cada plantilla disponible
        const buttons = svgFiles.map(file => {
            return [{ text: file, callback_data: `template_${file}` }];
        });

        ctx.reply('¡Hola! Soy el generador de imágenes. Selecciona una plantilla para comenzar:', {
            reply_markup: {
                inline_keyboard: buttons
            }
        });
        
        // Limpiamos la sesión al iniciar un nuevo proceso
        ctx.session = {};
    } catch (error) {
        console.error('Error leyendo plantillas:', error);
        ctx.reply('Ocurrió un error al leer las plantillas desde el servidor.');
    }
});

// Manejamos la selección de plantilla
bot.action(/^template_(.+)$/, async (ctx) => {
    const fileName = ctx.match[1];
    const filePath = path.join(TEMPLATES_DIR, fileName);

    try {
        const svgContent = await fs.readFile(filePath, 'utf-8');
        const variables = extractVariables(svgContent);

        if (variables.length === 0) {
            await ctx.answerCbQuery();
            return ctx.reply('La plantilla seleccionada no tiene variables dinámicas ({{Variable}}). Por favor, elige otra o contacta al administrador.');
        }

        // Inicializamos el estado en la sesión para llevar la conversación
        ctx.session = ctx.session || {};
        ctx.session.templateName = fileName;
        ctx.session.svgContent = svgContent;
        ctx.session.variables = variables;
        ctx.session.answers = {};
        ctx.session.currentStep = 0;

        await ctx.answerCbQuery();
        await ctx.reply(`Has seleccionado la plantilla *${fileName}*. Empecemos el proceso.\n\nPor favor, ingresa el valor para: **${variables[0]}**`, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error('Error procesando la plantilla:', error);
        ctx.reply('Ocurrió un error al cargar y procesar la plantilla seleccionada.');
    }
});

// Capturamos los mensajes de texto para responder a los pasos
bot.on('text', async (ctx) => {
    // Verificamos si hay una sesión activa y estamos en medio de un cuestionario
    if (!ctx.session || !ctx.session.variables || ctx.session.currentStep === undefined) {
        return; // Ignorar mensajes si no se ha iniciado un proceso
    }

    const { variables, currentStep } = ctx.session;
    
    if (currentStep >= variables.length) return; // Ya terminó de responder
    
    const currentVar = variables[currentStep];

    // Guardamos la respuesta del usuario
    ctx.session.answers[currentVar] = ctx.message.text;
    ctx.session.currentStep += 1;

    // Comprobamos si faltan más variables por llenar
    if (ctx.session.currentStep < variables.length) {
        const nextVar = variables[ctx.session.currentStep];
        return ctx.reply(`Ingresa el valor para: **${nextVar}**`, { parse_mode: 'Markdown' });
    } else {
        // Ya tenemos todas las variables, procedemos a generar la imagen
        await ctx.reply('Generando imagen, por favor espera...');
        
        try {
            let finalSvg = ctx.session.svgContent;
            
            // Reemplazar las variables dinámicas con las respuestas
            for (const [key, value] of Object.entries(ctx.session.answers)) {
                // Regex global para reemplazar todas las ocurrencias de la variable
                const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
                finalSvg = finalSvg.replace(regex, value);
            }

            // Convertimos el string SVG a un buffer PNG utilizando Sharp
            const imageBuffer = await sharp(Buffer.from(finalSvg))
                .png()
                .toBuffer();

            // Enviamos la imagen generada al usuario
            await ctx.replyWithPhoto({ source: imageBuffer }, { caption: `Imagen generada usando ${ctx.session.templateName}` });
            
            // Limpiamos la sesión
            ctx.session = {};
        } catch (error) {
            console.error('Error generando la imagen:', error);
            ctx.reply('Ocurrió un error al generar la imagen. Verifica que la plantilla sea un SVG válido.');
            ctx.session = {}; // Limpiar sesión en caso de error
        }
    }
});

// Iniciar el bot
bot.launch().then(() => {
    console.log('Bot de generación de SVG iniciado correctamente.');
}).catch((err) => {
    console.error('Error al iniciar el bot:', err);
});

// Habilitar detención controlada
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
