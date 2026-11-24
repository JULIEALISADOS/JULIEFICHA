import { sedePorNombre, POLITICA_GARANTIA, sumarDias, fmtFechaLarga } from './config.js';
import { getSignaturePads } from './signature.js';

export async function generatePDF() {
    const pdfBtn = document.getElementById('pdfBtn');
    if (pdfBtn) {
        pdfBtn.disabled = true;
        pdfBtn.innerHTML = '⌛';
    }

    try {
        const f = document.getElementById('fichaForm');
        const age = parseInt(f.querySelector('[name="edad"]')?.value) || 0;
        const isMinor = age < 18;

        const getVal = (name) => {
            const el = f.querySelector(`[name="${name}"]`);
            if (!el) return '---';
            if (el.type === 'checkbox') return el.checked ? 'Si' : 'No';
            return el.value && el.value.trim() !== '' ? el.value : '---';
        };

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
        const pageWidth = doc.internal.pageSize.getWidth();
        let y = 0;

        const colors = {
            gold: [255, 61, 154],
            dark: [17, 17, 17],
            gray: [100, 100, 100],
            lightGray: [245, 245, 245],
            white: [255, 255, 255]
        };

        const checkSpace = (h) => {
            if (y + h > 275) {
                doc.addPage();
                y = 15;
                doc.setFillColor(...colors.gold);
                doc.rect(0, 0, pageWidth, 3, 'F');
                return true;
            }
            return false;
        };

        const drawSectionHeader = (title) => {
            checkSpace(15);
            y += 6;
            doc.setFillColor(...colors.gold);
            doc.rect(15, y - 4, 2, 6, 'F');
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...colors.dark);
            doc.text(title.toUpperCase(), 20, y + 1);
            doc.setDrawColor(230, 230, 230);
            doc.line(15, y + 4, pageWidth - 15, y + 4);
            y += 12;
        };

        const drawField = (label, value, x, w) => {
            doc.setFontSize(7);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...colors.gold);
            doc.text(label.toUpperCase(), x, y);

            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...colors.dark);
            const splitVal = doc.splitTextToSize(value, w);
            doc.text(splitVal, x, y + 4.5);
            return (splitVal.length * 4) + 6;
        };

        const loadImg = (url) => new Promise((resolve) => {
            if (!url || url === '---' || url === 'sin-foto') { resolve(null); return; }
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = url;
        });
        // Foto lista para el PDF: reducida (max 1200 px) y en JPEG para que el archivo no pese; conserva la proporcion.
        const fotoParaPdf = async (url) => {
            const img = await loadImg(url);
            if (!img || !img.naturalWidth) return null;
            try {
                const k = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight));
                const c = document.createElement('canvas');
                c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
                const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
                ctx.drawImage(img, 0, 0, c.width, c.height);
                return { data: c.toDataURL('image/jpeg', 0.82), w: c.width, h: c.height };
            } catch (e) { return null; } // imagen bloqueada por el navegador: se omite, el PDF sigue
        };
        // Encaja una imagen en un recuadro sin deformarla (centrada)
        const encajar = (wImg, hImg, wMax, hMax) => { const k = Math.min(wMax / wImg, hMax / hImg); return { w: wImg * k, h: hImg * k }; };
        // Prueba guardada del consentimiento (ficha ya guardada) o null (ficha en curso)
        const ficha = window.isLocked ? (window.lastViewedFicha || null) : null;
        let evid = null;
        try { const raw = ficha ? ficha.consent_evidencia : f.querySelector('[name="consent_evidencia"]')?.value; evid = typeof raw === 'string' ? JSON.parse(raw || 'null') : (raw || null); } catch (e) { evid = null; }

        // --- HEADER ---
        doc.setFillColor(...colors.gold);
        doc.rect(0, 0, pageWidth, 3, 'F');
        y = 12;

        const logoImg = await fotoParaPdf('logo.png'); // logo reducido (antes pesaba ~2 MB dentro del PDF)
        if (logoImg) { const d = encajar(logoImg.w, logoImg.h, 40, 15); doc.addImage(logoImg.data, 'JPEG', 15, y - 3, d.w, d.h); }

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...colors.dark);
        doc.text('FICHA TÉCNICA CAPILAR', pageWidth - 15, y + 3, { align: 'right' });

        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...colors.gray);
        doc.text('DIAGNÓSTICO PROFESIONAL PERSONALIZADO', pageWidth - 15, y + 8, { align: 'right' });

        doc.setFontSize(7);
        doc.text(`Ficha #${getVal('consecutivo')} | ${getVal('fecha_diligenciamiento')}`, pageWidth - 15, y + 12, { align: 'right' });

        y += 20;

        // --- CLIENTE BOX ---
        doc.setFillColor(...colors.lightGray);
        doc.roundedRect(15, y, pageWidth - 30, 28, 2, 2, 'F');
        doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...colors.gold);
        doc.text('CLIENTE', 20, y + 6);
        doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...colors.dark);
        doc.text(getVal('nombre_completo'), 20, y + 13);
        doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...colors.gray);
        doc.text(`${getVal('tipo_documento')}: ${getVal('numero_documento')}  |  TEL: ${getVal('telefono')}  |  EDAD: ${getVal('edad')} AÑOS`, 20, y + 18);
        doc.text(`EMAIL: ${getVal('email')}  |  SEDE: ${getVal('sede')}`, 20, y + 22);
        doc.text(`ORIGEN: ${getVal('como_nos_conociste')}  |  ESTILISTA: ${getVal('estilista_responsable')}`, 20, y + 26);

        y += 32;

        // --- SECCIÓN 1: DIAGNÓSTICO ---
        drawSectionHeader('1. Diagnóstico Técnico de Fibra');
        const col1 = 20, col2 = pageWidth / 2 + 5;

        let h1 = drawField('Patrón de Rizo', getVal('tipo_cabello'), col1, 80);
        let h2 = drawField('Longitud', getVal('longitud'), col2, 80);
        y += Math.max(h1, h2);

        h1 = drawField('Crecimiento', getVal('estado_crecimiento'), col1, 40);
        h1 = Math.max(h1, drawField('Medios', getVal('estado_medios'), col1 + 45, 40));
        h2 = drawField('Puntas', getVal('estado_puntas'), col2, 80);
        y += Math.max(h1, h2);

        const obsDiag = getVal('observaciones_diagnostico');
        if (obsDiag !== '---') {
            y += drawField('Observaciones Diagnóstico', obsDiag, col1, pageWidth - 40);
        }

        // --- SECCIÓN 2: CARACTERÍSTICAS ---
        drawSectionHeader('2. Características del Cabello');

        h1 = drawField('Textura', getVal('textura'), col1, 40);
        h1 = Math.max(h1, drawField('Elasticidad', getVal('elasticidad'), col1 + 45, 40));
        h2 = drawField('Resistencia', getVal('resistencia'), col2, 40);
        h2 = Math.max(h2, drawField('Porosidad', getVal('porosidad'), col2 + 45, 40));
        y += Math.max(h1, h2);

        h1 = drawField('Densidad', getVal('densidad'), col1, 80);
        y += h1;

        y += drawField('Procesos Químicos', getVal('procesos_quimicos'), col1, pageWidth - 40);
        y += drawField('Terapias Capilares', getVal('terapias_capilares'), col1, pageWidth - 40);

        // --- SECCIÓN 3: CUERO CABELLUDO ---
        drawSectionHeader('3. Cuero Cabelludo');

        h1 = drawField('Piel Cabelluda', getVal('piel_cabelluda'), col1, 40);
        h1 = Math.max(h1, drawField('Frec. Lavado', getVal('frecuencia_lavado'), col1 + 45, 40));
        h2 = drawField('Dermatitis', getVal('dermatitis'), col2, 40);
        h2 = Math.max(h2, drawField('Caída', getVal('caida'), col2 + 45, 40));
        y += Math.max(h1, h2);

        h1 = drawField('Descamación', getVal('descamacion'), col1, 80);
        y += h1;

        const obsCuero = getVal('observaciones_cuero');
        if (obsCuero !== '---') {
            y += drawField('Observaciones Cuero', obsCuero, col1, pageWidth - 40);
        }

        // --- SECCIÓN 4: PROCEDIMIENTO Y GARANTÍA ---
        drawSectionHeader('4. Procedimiento y Garantía');

        h1 = drawField('Alergias a productos', [getVal('alergias'), getVal('alergias_descripcion')].filter((x) => x && x !== '---').join(': '), col1, 80);
        h2 = drawField('Procedimiento', getVal('procedimiento'), col2, 80);
        y += Math.max(h1, h2);

        h1 = drawField('Objetivo de liso acordado', getVal('porcentaje_liso'), col1, 80);
        h2 = drawField('Estilista', getVal('estilista_responsable'), col2, 80);
        y += Math.max(h1, h2);

        y += drawField('Técnica/Productos', getVal('tecnica_utilizada'), col1, pageWidth - 40);

        // --- NUEVA SECCIÓN: RECOMENDACIÓN DE PRODUCTOS JULIE ALISADOS (BOOST VENTAS) ---
        checkSpace(35);
        y += 5;
        doc.setFillColor(255, 240, 247);
        doc.setDrawColor(...colors.gold);
        doc.roundedRect(15, y, pageWidth - 30, 25, 2, 2, 'FD');
        
        doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...colors.gold);
        doc.text('RECOMENDACIÓN PROFESIONAL JULIE ALISADOS', 20, y + 6);
        
        doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(...colors.dark);
        let reco = "Para mantener tu resultado impecable, recomendamos: ";
        const porosidad = getVal('porosidad');
        const elasticidad = getVal('elasticidad');
        const piel = getVal('piel_cabelluda');
        
        if (porosidad === 'Alta') reco += "MASCARILLA ORO LÍQUIDO o R.C.P Profesional. ";
        if (elasticidad === 'Baja') reco += "REPOSICIÓN DE AMINOÁCIDOS y AMPOLLA S.O.S. ";
        if (/^(Sec|Gras)/i.test(piel)) reco += "SHAMPOO EXTRACTOS NATURALES. "; // la ficha guarda "Seco"/"Graso" (antes nunca coincidia)
        
        // Recomendación por defecto si no hay alertas graves
        if (reco === "Para mantener tu resultado impecable, recomendamos: ") {
            reco += "LÍNEA DE ARGÁN (Shampoo + Acondicionador) y TERMOPROTECTOR CON PERFUME CAPILAR.";
        } else {
            reco += "Complementa con ACEITE REPARADOR DE ARGÁN para sellar puntas.";
        }
        
        doc.text(doc.splitTextToSize(reco, pageWidth - 40), 20, y + 12);
        doc.setFontSize(6); doc.setFont('helvetica', 'italic');
        doc.text('Pide tus productos originales Julie Alisados al WhatsApp 304 358 8180 (envío nacional).', 20, y + 21);
        y += 30;

        // --- ADVERTENCIA LEGAL (SI APLICA) ---
        if (false) { // datos de embarazo/medicamentos ya no se piden (20-nov)
            checkSpace(20);
            y += 5;
            doc.setFillColor(255, 248, 240); // Fondo naranja muy suave
            doc.setDrawColor(...colors.gold);
            doc.roundedRect(15, y, pageWidth - 30, 18, 2, 2, 'FD');
            
            doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...colors.dark);
            doc.text('NOTA DE SEGURIDAD Y PRIVACIDAD:', 20, y + 6);
            
            doc.setFontSize(6.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(...colors.gray);
            const legalText = "En Julie Alisados, el bienestar es nuestra prioridad. El suministro de datos sobre salud es opcional; sin embargo, para garantizar un resultado óptimo y seguro, la falta de esta información podría limitar la aplicación de garantías o la realización del servicio por seguridad. La cliente acepta continuar bajo estas condiciones.";
            doc.text(doc.splitTextToSize(legalText, pageWidth - 40), 20, y + 10);
            y += 22;
        }

        // --- SECCIÓN 5: EVIDENCIA FOTOGRÁFICA (todas las fotos, 2 por fila, sin deformar) ---
        const fuentes = [
            ['ANTES', '#previewAntes img'], ['DESPUÉS', '#previewDespues img'],
            ['DIAGNÓSTICO', '#previewObsDiag img'], ['CARACTERÍSTICAS', '#previewObsCarac img'], ['CUERO CABELLUDO', '#previewObsCuero img']
        ].map(([t, sel]) => [t, f.querySelector(sel)?.src]);
        f.querySelectorAll('#previewExtra img').forEach((im, i) => fuentes.push([`ADICIONAL ${i + 1}`, im.src]));
        const fotos = [];
        for (const [t, u] of fuentes) { if (u) { const fo = await fotoParaPdf(u); if (fo) fotos.push({ t, ...fo }); } }
        drawSectionHeader('5. Evidencia Fotográfica');
        if (!fotos.length) {
            doc.setFontSize(8); doc.setFont('helvetica', 'italic'); doc.setTextColor(...colors.gray);
            doc.text('Sin fotos registradas en esta ficha.', 20, y); y += 8;
        }
        const celdaW = (pageWidth - 40) / 2, celdaH = 58; // 3 filas por página
        for (let i = 0; i < fotos.length; i += 2) {
            checkSpace(celdaH + 10);
            [fotos[i], fotos[i + 1]].forEach((fo, j) => {
                if (!fo) return;
                const x0 = 15 + j * (celdaW + 10);
                doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...colors.gold);
                doc.text(fo.t, x0 + celdaW / 2, y, { align: 'center' });
                const d = encajar(fo.w, fo.h, celdaW, celdaH);
                const xi = x0 + (celdaW - d.w) / 2, yi = y + 3;
                doc.setDrawColor(...colors.gold); doc.setLineWidth(0.4);
                doc.rect(xi - 0.5, yi - 0.5, d.w + 1, d.h + 1);
                try { doc.addImage(fo.data, 'JPEG', xi, yi, d.w, d.h); } catch (e) {}
            });
            y += celdaH + 10;
        }

        // --- SECCIÓN 6: CONSENTIMIENTO INFORMADO ---
        doc.addPage(); // Forzar página nueva para que sea un "documento aparte"
        y = 15;
        doc.setFillColor(...colors.gold);
        doc.rect(0, 0, pageWidth, 3, 'F');
        
        drawSectionHeader('6. Consentimiento Informado y Legal');
        
        // Historial Adicional
        y += drawField('Químicos Previos', getVal('consent_quimicos'), col1, 80);
        
        y += 5;
        doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
        const lineasConsent = doc.splitTextToSize("DECLARACIÓN Y ACEPTACIÓN: El alisado capilar consiste en la aplicación de productos químicos diseñados para modificar la estructura del cabello. El resultado depende de factores individuales como el tipo de cabello y su historial previo. Fui informada sobre los resultados esperados, los cuidados y el plan de trabajo propuesto. POLÍTICA DE GARANTÍA (Ley 1480 de 2011): dura 20 días calendario desde el procedimiento y cubre defectos del procedimiento o de los productos usados, en los locales de Julie Alisados. Para reclamar escribiré al WhatsApp 304 358 8180 dentro de ese plazo con un video del cabello recién lavado y secado, e indicaré los productos usados. Si se confirma una falla del procedimiento se corrige sin costo, no antes de 8 días del servicio original; si el problema se debe a no seguir los cuidados, el lavado en sede cuesta $20.000 y la garantía se cierra. Aplican las exclusiones de la política publicada en juliealisados.com/politica-garantia. Autorizo el tratamiento de mis datos personales según la Ley 1581 de 2012. He leído y comprendido toda la información y acepto voluntariamente el procedimiento.", pageWidth - 40);
        const altoConsent = 14 + lineasConsent.length * 3.3; // el recuadro se ajusta al texto (antes quedaba medio vacío)
        doc.setFillColor(252, 252, 252);
        doc.setDrawColor(220, 220, 220);
        doc.roundedRect(15, y, pageWidth - 30, altoConsent, 2, 2, 'FD');

        doc.setTextColor(...colors.dark);
        doc.text(lineasConsent, 20, y + 6);

        // Autorización de fotos (en ficha guardada: la prueba guardada)
        const pubOk = (ficha && evid?.aceptados && 'fotos_publicidad' in evid.aceptados) ? !!evid.aceptados.fotos_publicidad : !!f.querySelector('[name="autoriza_publicidad"]')?.checked;
        const autPub = pubOk ? "SÍ AUTORIZA" : "NO AUTORIZA";
        doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...colors.gold);
        doc.text(`AUTORIZACIÓN USO PUBLICITARIO DE IMAGEN: ${autPub}`, 20, y + altoConsent - 4);

        y += altoConsent + 12;

        // --- SECCIÓN 7: FIRMAS DE ACEPTACIÓN ---
        // Obtener firmas
        let sigC = '', sigT = '', sigM = '';
        const { padClient, padTech, padTutor } = getSignaturePads();

        if (window.isLocked && window.lastViewedFicha) {
            sigC = window.lastViewedFicha.firma_cliente || '';
            sigT = window.lastViewedFicha.firma_tecnico || '';
            sigM = window.lastViewedFicha.firma_tutor_legal || '';
        } else {
            if (padClient && !padClient.isEmpty()) sigC = padClient.toDataURL();
            if (padTech && !padTech.isEmpty()) sigT = padTech.toDataURL();
            if (padTutor && !padTutor.isEmpty()) sigM = padTutor.toDataURL();
        }

        const drawSig = (src, label, printedName, x, yPos) => {
            doc.setDrawColor(...colors.gray); doc.setLineWidth(0.3);
            doc.line(x, yPos, x + 60, yPos);
            doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...colors.gray);
            doc.text(label, x + 30, yPos + 4, { align: 'center' });
            if (printedName && printedName !== '---') {
                doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...colors.dark);
                doc.text(printedName.toUpperCase(), x + 30, yPos + 8, { align: 'center' });
            }
            if (src && src.startsWith('data:image')) {
                try {
                    const p = doc.getImageProperties(src); const d = encajar(p.width, p.height, 56, 22);
                    doc.addImage(src, 'PNG', x + 30 - d.w / 2, yPos - 1 - d.h, d.w, d.h);
                } catch (e) {}
            }
        };

        // Firma Cliente y Técnico en una sola fila
        drawSig(sigC, 'FIRMA DE CONFORMIDAD CLIENTE', getVal('nombre_completo'), 15, y + 25);
        drawSig(sigT, 'FIRMA TÉCNICO RESPONSABLE', getVal('estilista_responsable'), pageWidth - 75, y + 25);

        if (isMinor) {
            y += 40;
            const nomTutor = (ficha && ficha.nombre_tutor) || document.getElementById('tutorNameInput')?.value || getVal('tutor_legal');
            drawSig(sigM, 'FIRMA TUTOR LEGAL / RESPONSABLE', nomTutor && nomTutor !== '---' ? nomTutor : 'Responsable del menor', 15, y + 25);
        }
        y += 38;

        // Autorizaciones separadas (ficha digital 18-nov-2026). En una ficha guardada se leen de la PRUEBA guardada, no de la pantalla.
        {
            const mapa = { authCheckbox: 'consentimiento_servicio', planTrabajoCheckbox: 'plan_trabajo', datosCheckbox: 'datos_personales_y_salud', acuerdoFirmaCheckbox: 'acuerdo_firma_electronica', marketingCheckbox: 'marketing_whatsapp_correo', photoPublicCheckbox: 'fotos_publicidad' };
            const chk = (id) => {
                if (ficha && evid?.aceptados && mapa[id] in evid.aceptados) return evid.aceptados[mapa[id]] ? 'SI' : 'NO';
                return document.getElementById(id)?.checked ? 'SI' : 'NO';
            };
            checkSpace(40);
            drawSectionHeader('Autorizaciones de la clienta');
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...colors.dark);
            [
                `Consentimiento informado del servicio: ${chk('authCheckbox')}`,
                `Plan de trabajo: ${chk('planTrabajoCheckbox')}`,
                (() => { let ev = null; try { ev = JSON.parse(f.querySelector('[name="consent_evidencia"]')?.value || 'null'); } catch (e) { ev = null; } const vence = ev?.aceptados?.garantia_vence_iso ? new Date(ev.aceptados.garantia_vence_iso) : sumarDias(new Date(), POLITICA_GARANTIA.diasVigencia); const cuid = (evid?.aceptados?.cuidados_entregados ?? ev?.aceptados?.cuidados_entregados) ?? document.getElementById('cuidadosCheckbox')?.checked; return `Garantía de ${POLITICA_GARANTIA.diasVigencia} días calendario, vigente hasta: ${fmtFechaLarga(vence)} | Indicaciones de cuidado entregadas: ${cuid ? 'SI' : 'NO'}`; })(),
                `Acuerdo de firma electrónica: ${chk('acuerdoFirmaCheckbox')}`,
                (() => { try { const e = (ficha && evid?.confirmacion_codigo) || JSON.parse(f.querySelector('[name="otp_evidencia"]')?.value || 'null'); return e && e.canal ? `Código confirmado por ${e.canal} (${e.destino_enmascarado}) el ${new Date(e.verificado_iso).toLocaleString('es-CO')}` : 'Código de confirmación: no se usó (firma en pantalla)'; } catch { return 'Código de confirmación: no se usó (firma en pantalla)'; } })(),
                `Tratamiento de datos personales y de salud capilar (Ley 1581): ${chk('datosCheckbox')}`,
                `Recibir novedades por WhatsApp o correo (opcional): ${isMinor ? 'NO' : chk('marketingCheckbox')}`,
                `Uso de fotos o videos en publicidad (opcional): ${isMinor ? 'NO' : chk('photoPublicCheckbox')}`
            ].forEach((t) => { doc.text(t, 20, y); y += 5; });
            y += 4;
        }

        // --- REGISTRO DE FIRMA ELECTRÓNICA (Ley 527 de 1999) ---
        // La hora es la de la FIRMA guardada (no la de imprimir el PDF).
        const fmtHora = (d) => `${d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Bogota' })} ${d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'America/Bogota' })}`;
        const firmadoIso = evid?.fecha_hora_iso || ficha?.created_at || null;
        const timestampFull = firmadoIso ? `${fmtHora(new Date(firmadoIso))} (hora de Colombia)` : 'Ficha aún sin guardar (borrador)';
        const sedeCfg = sedePorNombre(getVal('sede'));
        const sedeLegal = sedeCfg ? `Sede ${sedeCfg.nombre} (${sedeCfg.direccion})` : `Sede ${getVal('sede')}`;
        const folioLegal = `JA-FOLIO-#${getVal('consecutivo')}`;

        checkSpace(34);
        const stampBoxY = y + 2;
        doc.setFillColor(250, 248, 242);
        doc.setDrawColor(212, 175, 55);
        doc.setLineWidth(0.4);
        doc.roundedRect(15, stampBoxY, pageWidth - 30, 29, 2, 2, 'FD');
        doc.setFontSize(6.8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(166, 134, 18);
        doc.text('REGISTRO DE FIRMA ELECTRÓNICA', 20, stampBoxY + 5);
        doc.setFontSize(6.2);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(60, 60, 60);
        doc.text(`• Identificador único: ${folioLegal}  |  Firmado: ${timestampFull}`, 20, stampBoxY + 9.5);
        doc.text(`• Sede de emisión y custodia: ${sedeLegal}`, 20, stampBoxY + 13.5);
        doc.text(`• Texto aceptado: versión ${evid?.version_texto || '---'}  |  Huella SHA-256: ${(evid?.huella_texto_sha256 || '---').slice(0, 32)}${evid?.huella_texto_sha256 ? '…' : ''}`, 20, stampBoxY + 17.5);
        doc.text('• Documento electrónico firmado en pantalla (Ley 527 de 1999). Datos tratados conforme a la Ley 1581 de 2012.', 20, stampBoxY + 21.5);
        doc.text(`• PDF generado: ${fmtHora(new Date())}. Copia fiel del registro guardado en el sistema de Julie Alisados S.A.S.`, 20, stampBoxY + 25.5);

        // Pie en TODAS las páginas: folio, página X de Y y aviso de confidencialidad
        const totalPag = doc.getNumberOfPages();
        const altoPag = doc.internal.pageSize.getHeight();
        for (let p = 1; p <= totalPag; p++) {
            doc.setPage(p);
            doc.setFillColor(...colors.gold);
            doc.rect(0, altoPag - 3, pageWidth, 3, 'F');
            doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...colors.gray);
            doc.text(`Julie Alisados S.A.S. · Ficha #${getVal('consecutivo')} · Documento confidencial (datos personales y de salud capilar)`, 15, altoPag - 6);
            doc.text(`Página ${p} de ${totalPag}`, pageWidth - 15, altoPag - 6, { align: 'right' });
        }

        const nombreArchivo = `Ficha_${getVal('nombre_completo').replace(/\s+/g, '_')}_${getVal('consecutivo')}.pdf`;
        // Celular/tablet: doc.save() suele quedar bloqueado. Se comparte o se abre el PDF en otra pestaña.
        if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
            const blob = doc.output('blob');
            const archivo = new File([blob], nombreArchivo, { type: 'application/pdf' });
            if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
                try { await navigator.share({ files: [archivo], title: nombreArchivo }); return; }
                catch (e) { if (e && e.name === 'AbortError') return; }
            }
            const u = URL.createObjectURL(blob);
            if (!window.open(u, '_blank')) location.href = u;
            return;
        }
        doc.save(nombreArchivo);
    } catch (err) {
        console.error('Error PDF:', err);
        alert('❌ Error al generar PDF: ' + err.message);
    } finally {
        if (pdfBtn) {
            pdfBtn.disabled = false;
            pdfBtn.innerHTML = '<i data-lucide="download"></i>';
            window.lucide?.createIcons();
        }
    }
}
