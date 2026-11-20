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
        const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
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

        // --- HEADER ---
        doc.setFillColor(...colors.gold);
        doc.rect(0, 0, pageWidth, 3, 'F');
        y = 12;

        const logoImg = await loadImg('logo.png');
        if (logoImg) doc.addImage(logoImg, 'PNG', 15, y - 3, 40, 15);

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
        
        if (porosidad === 'Alta') reco += "MASCARILLA ORO LÍQUIDO (Jojoba + Keratina) o R.C.P Profesional. ";
        if (elasticidad === 'Baja') reco += "REPOSICIÓN DE AMINOÁCIDOS y AMPOLLA S.O.S. ";
        if (piel === 'Seca' || piel === 'Grasa') reco += "SHAMPOO EXTRACTOS NATURALES (12 Extractos). ";
        
        // Recomendación por defecto si no hay alertas graves
        if (reco === "Para mantener tu resultado impecable, recomendamos: ") {
            reco += "LÍNEA DE ARGÁN (Shampoo + Acondicionador) y TERMOPROTECTOR CON PERFUME CAPILAR.";
        } else {
            reco += "Complementa con ACEITE REPARADOR DE ARGÁN para sellar puntas.";
        }
        
        doc.text(doc.splitTextToSize(reco, pageWidth - 40), 20, y + 12);
        doc.setFontSize(6); doc.setFont('helvetica', 'italic');
        doc.text('🛒 Pide tus productos originales Julie Alisados al WhatsApp: 3043588180 (Envío Nacional)', 20, y + 21);
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

        // --- SECCIÓN 5: EVIDENCIA FOTOGRÁFICA ---
        drawSectionHeader('5. Evidencia Fotográfica');
        const imgW = 80, imgH = 70;
        checkSpace(imgH + 10);
        const fotoA = await loadImg(f.querySelector('#previewAntes img')?.src);
        const fotoD = await loadImg(f.querySelector('#previewDespues img')?.src);

        doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...colors.gold);
        doc.text('ANTES', 15 + imgW / 2, y, { align: 'center' });
        doc.text('DESPUÉS', pageWidth - 15 - imgW / 2, y, { align: 'center' });
        y += 3;

        if (fotoA) {
            doc.setDrawColor(...colors.gold); doc.setLineWidth(0.5);
            doc.rect(14.5, y - 0.5, imgW + 1, imgH + 1);
            doc.addImage(fotoA, 'JPEG', 15, y, imgW, imgH);
        }
        if (fotoD) {
            doc.setDrawColor(...colors.gold); doc.setLineWidth(0.5);
            doc.rect(pageWidth - 15 - imgW - 0.5, y - 0.5, imgW + 1, imgH + 1);
            doc.addImage(fotoD, 'JPEG', pageWidth - 15 - imgW, y, imgW, imgH);
        }
        y += imgH + 10;

        // --- SECCIÓN 6: CONSENTIMIENTO INFORMADO ---
        doc.addPage(); // Forzar página nueva para que sea un "documento aparte"
        y = 15;
        doc.setFillColor(...colors.gold);
        doc.rect(0, 0, pageWidth, 3, 'F');
        
        drawSectionHeader('6. Consentimiento Informado y Legal');
        
        // Historial Adicional
        y += drawField('Químicos Previos', getVal('consent_quimicos'), col1, 80);
        
        y += 5;
        doc.setFillColor(252, 252, 252);
        doc.setDrawColor(220, 220, 220);
        doc.roundedRect(15, y, pageWidth - 30, 60, 2, 2, 'FD');
        
        doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(...colors.dark);
        const consentText = "DECLARACIÓN Y ACEPTACIÓN: El alisado capilar consiste en la aplicación de productos químicos diseñados para modificar la estructura del cabello. El resultado depende de factores individuales como el tipo de cabello y su historial previo. Fui informada sobre los resultados esperados, los cuidados y el plan de trabajo propuesto. POLÍTICA DE GARANTÍA (Ley 1480 de 2011): dura 20 días calendario desde el procedimiento y cubre defectos del procedimiento o de los productos usados, en los locales de Julie Alisados. Para reclamar escribiré al WhatsApp 304 358 8180 dentro de ese plazo con un video del cabello recién lavado y secado, e indicaré los productos usados. Si se confirma una falla del procedimiento se corrige sin costo, no antes de 8 días del servicio original; si el problema se debe a no seguir los cuidados, el lavado en sede cuesta $20.000 y la garantía se cierra. Aplican las exclusiones de la política publicada en juliealisados.com/politica-garantia. Autorizo el tratamiento de mis datos personales según la Ley 1581 de 2012. He leído y comprendido toda la información y acepto voluntariamente el procedimiento.";
        doc.text(doc.splitTextToSize(consentText, pageWidth - 40), 20, y + 8);
        
        // Autorización de fotos
        const autPub = f.querySelector('[name="autoriza_publicidad"]')?.checked ? "SÍ AUTORIZA" : "NO AUTORIZA";
        doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...colors.gold);
        doc.text(`AUTORIZACIÓN USO PUBLICITARIO DE IMAGEN: ${autPub}`, 20, y + 52);
        
        y += 85;

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
                try { doc.addImage(src, 'PNG', x + 10, yPos - 22, 40, 22); } catch (e) {}
            }
        };

        // Firma Cliente y Técnico en una sola fila para ahorrar espacio o mejor disposición
        drawSig(sigC, 'FIRMA DE CONFORMIDAD CLIENTE', getVal('nombre_completo'), 15, y + 25);
        drawSig(sigT, 'FIRMA TÉCNICO RESPONSABLE', getVal('estilista_responsable'), pageWidth - 75, y + 25);
        
        if (isMinor) {
            y += 40;
            drawSig(sigM, 'FIRMA TUTOR LEGAL / RESPONSABLE', getVal('nombre_tutor') || 'Responsable Menor', 15, y + 25);
        }

        // Autorizaciones separadas (ficha digital 18-nov-2026)
        {
            const chk = (id) => document.getElementById(id)?.checked ? 'SI' : 'NO';
            checkSpace(40);
            drawSectionHeader('Autorizaciones de la clienta');
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...colors.dark);
            [
                `Consentimiento informado del servicio: ${chk('authCheckbox')}`,
                `Plan de trabajo: ${chk('planTrabajoCheckbox')}`,
                (() => { let ev = null; try { ev = JSON.parse(f.querySelector('[name="consent_evidencia"]')?.value || 'null'); } catch (e) { ev = null; } const vence = ev?.aceptados?.garantia_vence_iso ? new Date(ev.aceptados.garantia_vence_iso) : sumarDias(new Date(), POLITICA_GARANTIA.diasVigencia); const cuid = ev?.aceptados?.cuidados_entregados ?? document.getElementById('cuidadosCheckbox')?.checked; return `Garantia de ${POLITICA_GARANTIA.diasVigencia} dias calendario, vigente hasta: ${fmtFechaLarga(vence)} | Indicaciones de cuidado entregadas: ${cuid ? 'SI' : 'NO'}`; })(),
                `Acuerdo de firma electronica (pantalla + codigo): ${chk('acuerdoFirmaCheckbox')}`,
                (() => { try { const e = JSON.parse(f.querySelector('[name="otp_evidencia"]')?.value || 'null'); return e ? `Codigo confirmado por ${e.canal} (${e.destino_enmascarado}) el ${new Date(e.verificado_iso).toLocaleString('es-CO')}` : 'Codigo de confirmacion: NO registrado'; } catch { return 'Codigo de confirmacion: NO registrado'; } })(),
                `Tratamiento de datos personales y de salud capilar (Ley 1581): ${chk('datosCheckbox')}`,
                `Recibir novedades por WhatsApp o correo (opcional): ${isMinor ? 'NO' : chk('marketingCheckbox')}`,
                `Uso de fotos o videos en publicidad (opcional): ${isMinor ? 'NO' : chk('photoPublicCheckbox')}`
            ].forEach((t) => { doc.text(t, 20, y); y += 5; });
            y += 4;
        }

        // Footer
        doc.setFillColor(...colors.gold);
        doc.rect(0, doc.internal.pageSize.getHeight() - 3, pageWidth, 3, 'F');

                // --- SELLO FORENSE DIGITAL DE VALIDEZ LEGAL (Ley 527 de 1999 y Decreto 2364 de 2012) ---
        const now = new Date();
        const dateStr = now.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const timeStr = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
        const timestampFull = `${dateStr} ${timeStr} (Hora Legal Colombia - UTC-5)`;
        const sedeCfg = sedePorNombre(getVal('sede'));
        const sedeLegal = sedeCfg ? `Sede ${sedeCfg.nombre} (${sedeCfg.direccion})` : `Sede ${getVal('sede')}`;
        const folioLegal = `JA-FOLIO-#${getVal('consecutivo')}`;

        const stampBoxY = isMinor ? y + 42 : y + 36;
        if (stampBoxY + 28 <= doc.internal.pageSize.getHeight() - 5) {
            doc.setFillColor(250, 248, 242);
            doc.setDrawColor(212, 175, 55);
            doc.setLineWidth(0.4);
            doc.roundedRect(15, stampBoxY, pageWidth - 30, 25, 2, 2, 'FD');

            doc.setFontSize(6.8);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(166, 134, 18);
            doc.text('REGISTRO DE FIRMA ELECTRÓNICA', 20, stampBoxY + 5);

            doc.setFontSize(6.2);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(60, 60, 60);
            doc.text(`• Identificador Único: ${folioLegal}  |  Estampa Cronológica: ${timestampFull}`, 20, stampBoxY + 9.5);
            doc.text(`• Sede de Emisión y Custodia: ${sedeLegal}`, 20, stampBoxY + 13.5);
            doc.text('• Documento electrónico firmado en pantalla (Ley 527 de 1999).', 20, stampBoxY + 17.5);
            doc.text('  Datos personales tratados conforme a la Ley 1581 de 2012 (Habeas Data).', 20, stampBoxY + 21.5);
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
