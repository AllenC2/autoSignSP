const { Telegraf, session } = require('telegraf');
const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const cheerio = require('cheerio');
const axios = require('axios');
require('dotenv').config();

const token = process.env.TELEGRAM_TOKEN;
if (!token) {
    console.error('ERROR: TELEGRAM_TOKEN no está definido en el archivo .env');
    process.exit(1);
}

const bot = new Telegraf(token);
const TEMPLATES_DIR = path.join(__dirname, 'templates');

bot.use(session());

const extractVariables = (svgContent) => {
    const regex = /\{\{([^}]+)\}\}/g;
    const variables = new Set();
    let match;
    while ((match = regex.exec(svgContent)) !== null) {
        variables.add(match[1].trim());
    }
    return Array.from(variables);
};

const getControlsKeyboard = () => {
    return {
        inline_keyboard: [
            [{ text: '⬆️ Arriba', callback_data: 'move_up' }],
            [{ text: '⬅️ Izquierda', callback_data: 'move_left' }, { text: '➡️ Derecha', callback_data: 'move_right' }],
            [{ text: '⬇️ Abajo', callback_data: 'move_down' }],
            [{ text: '➕ Escalar +', callback_data: 'scale_up' }, { text: '➖ Escalar -', callback_data: 'scale_down' }],
            [{ text: '✅ Finalizar', callback_data: 'finish_edit' }]
        ]
    };
};

const generateImageBuffer = async (ctx) => {
    const $ = cheerio.load(ctx.session.svgContent, { xmlMode: true, decodeEntities: false });
    
    // Primero reemplazamos las imágenes usando Cheerio para transformar el XML
    for (const [key, ans] of Object.entries(ctx.session.answers)) {
        if (ans.type === 'image') {
            const textNodes = $('text').filter(function() {
                return $(this).text().includes(`{{${key}}}`);
            });
            
            textNodes.each(function() {
                const x = $(this).attr('x') || 0;
                const y = $(this).attr('y') || 0;
                const size = 200 * ans.scale;
                const dx = ans.dx;
                const dy = ans.dy;
                
                $(this).replaceWith(`<image x="${x}" y="${y}" width="${size}" height="${size}" href="${ans.value}" transform="translate(${dx}, ${dy})" />`);
            });
        }
    }
    
    let modifiedSvg = $.xml();
    
    // Luego reemplazamos el texto usando expresiones regulares
    for (const [key, ans] of Object.entries(ctx.session.answers)) {
        if (ans.type === 'text') {
            modifiedSvg = modifiedSvg.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), ans.value);
        }
    }
    
    return await sharp(Buffer.from(modifiedSvg)).png().toBuffer();
};

bot.command('start', async (ctx) => {
    try {
        const files = await fs.readdir(TEMPLATES_DIR);
        const svgFiles = files.filter(file => file.endsWith('.svg'));

        if (svgFiles.length === 0) {
            return ctx.reply('No se encontraron plantillas en la carpeta /templates.');
        }

        const buttons = svgFiles.map(file => {
            return [{ text: file, callback_data: `template_${file}` }];
        });

        ctx.reply('¡Hola! Soy el generador de imágenes. Selecciona una plantilla para comenzar:', {
            reply_markup: { inline_keyboard: buttons }
        });
        
        ctx.session = {};
    } catch (error) {
        console.error('Error leyendo plantillas:', error);
        ctx.reply('Ocurrió un error al leer las plantillas desde el servidor.');
    }
});

bot.action(/^template_(.+)$/, async (ctx) => {
    const fileName = ctx.match[1];
    const filePath = path.join(TEMPLATES_DIR, fileName);

    try {
        const svgContent = await fs.readFile(filePath, 'utf-8');
        const variables = extractVariables(svgContent);

        if (variables.length === 0) {
            await ctx.answerCbQuery();
            return ctx.reply('La plantilla seleccionada no tiene variables dinámicas ({{Variable}}).');
        }

        ctx.session = {
            templateName: fileName,
            svgContent: svgContent,
            variables: variables,
            answers: {},
            currentStep: 0
        };

        await ctx.answerCbQuery();
        await ctx.reply(`Has seleccionado la plantilla *${fileName}*. Empecemos.\n\nPor favor, ingresa el valor (texto o envía una imagen como documento) para: **${variables[0]}**`, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error('Error procesando la plantilla:', error);
        ctx.reply('Ocurrió un error al cargar y procesar la plantilla.');
    }
});

bot.on(['text', 'photo', 'document'], async (ctx) => {
    if (!ctx.session || !ctx.session.variables || ctx.session.currentStep === undefined) return;
    
    const { variables, currentStep } = ctx.session;
    if (currentStep >= variables.length) return;
    
    const currentVar = variables[currentStep];
    
    if (ctx.message.text) {
        ctx.session.answers[currentVar] = { type: 'text', value: ctx.message.text };
    } else if (ctx.message.photo || ctx.message.document) {
        let fileId;
        if (ctx.message.photo) {
            fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        } else {
            const mime = ctx.message.document.mime_type;
            if (!mime || !mime.startsWith('image/')) {
                return ctx.reply('Por favor envía un archivo de imagen válido (PNG/JPG).');
            }
            fileId = ctx.message.document.file_id;
        }
        
        const loadingMsg = await ctx.reply('Descargando imagen...');
        try {
            const fileUrl = await ctx.telegram.getFileLink(fileId);
            const response = await axios.get(fileUrl.href, { responseType: 'arraybuffer' });
            const base64 = Buffer.from(response.data).toString('base64');
            const dataUri = `data:image/png;base64,${base64}`;
            
            ctx.session.answers[currentVar] = { type: 'image', value: dataUri, dx: 0, dy: 0, scale: 1 };
            await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
        } catch (e) {
            console.error('Error descargando imagen:', e);
            return ctx.reply('Ocurrió un error al procesar tu imagen. Intenta de nuevo.');
        }
    }
    
    ctx.session.currentStep += 1;
    
    if (ctx.session.currentStep < variables.length) {
        const nextVar = variables[ctx.session.currentStep];
        return ctx.reply(`Ingresa el valor (texto o imagen) para: **${nextVar}**`, { parse_mode: 'Markdown' });
    } else {
        await ctx.reply('Generando imagen, por favor espera...');
        try {
            const buffer = await generateImageBuffer(ctx);
            const imageVars = Object.keys(ctx.session.answers).filter(k => ctx.session.answers[k].type === 'image');
            
            if (imageVars.length > 0) {
                // Seleccionamos la primera imagen por defecto para interactuar
                ctx.session.activeImageVar = imageVars[0];
                await ctx.replyWithPhoto({ source: buffer }, { 
                    caption: `Ajustando la imagen de **${ctx.session.activeImageVar}**. Usa los controles abajo:`, 
                    reply_markup: getControlsKeyboard(),
                    parse_mode: 'Markdown'
                });
            } else {
                await ctx.replyWithPhoto({ source: buffer });
                ctx.session = {}; 
            }
        } catch (error) {
            console.error(error);
            ctx.reply('Error al generar la imagen.');
            ctx.session = {};
        }
    }
});

// Controladores de Movimiento
const handleMovement = async (ctx, dx, dy, dScale) => {
    if (!ctx.session || !ctx.session.activeImageVar) {
        return ctx.answerCbQuery('La sesión ha expirado. Escribe /start de nuevo.', {show_alert: true});
    }
    
    const activeVar = ctx.session.answers[ctx.session.activeImageVar];
    activeVar.dx += dx;
    activeVar.dy += dy;
    activeVar.scale += dScale;
    if (activeVar.scale < 0.1) activeVar.scale = 0.1; // Evitar escala negativa o cero
    
    try {
        const buffer = await generateImageBuffer(ctx);
        await ctx.editMessageMedia(
            { type: 'photo', media: { source: buffer } },
            { reply_markup: getControlsKeyboard() }
        );
        await ctx.answerCbQuery();
    } catch (e) {
        console.error('Error actualizando el frame:', e);
        await ctx.answerCbQuery('Error al actualizar la imagen.');
    }
};

bot.action('move_up', ctx => handleMovement(ctx, 0, -10, 0));
bot.action('move_down', ctx => handleMovement(ctx, 0, 10, 0));
bot.action('move_left', ctx => handleMovement(ctx, -10, 0, 0));
bot.action('move_right', ctx => handleMovement(ctx, 10, 0, 0));
bot.action('scale_up', ctx => handleMovement(ctx, 0, 0, 0.1));
bot.action('scale_down', ctx => handleMovement(ctx, 0, 0, -0.1));

bot.action('finish_edit', async ctx => {
    await ctx.answerCbQuery('¡Imagen finalizada!');
    try {
        await ctx.editMessageCaption('¡Imagen generada con éxito!');
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    } catch(e) {}
    ctx.session = {}; // Limpiamos para una nueva plantilla
});

bot.launch().then(() => console.log('Bot iniciado.')).catch(console.error);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
