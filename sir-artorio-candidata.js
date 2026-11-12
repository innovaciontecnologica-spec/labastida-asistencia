/*
 * Candidata de integración de Sir Artorio para LABASTIDA 2.3.9.
 * BLOQUEADA EN PRODUCCIÓN hasta aprobar la conexión institucional de solo lectura.
 * La candidata usa la ruta EXISTENTE la231Clases, cuya autorización se
 * determina en Apps Script. Jamás usa el Worker QA con datos reales.
 * El modo demo es exclusivamente local (file:// o localhost) y usa datos inventados.
 */
'use strict';

// Solo esta página aislada de GitHub Pages puede consultar el servidor real.
const LA_ARTORIO_SERVIDOR_HABILITADO = location.protocol === 'https:' &&
  location.hostname === 'innovaciontecnologica-spec.github.io' &&
  location.pathname === '/labastida-asistencia/sir-artorio-candidata.html';
const LA_ARTORIO_HOST_LOCAL = location.protocol === 'file:' ||
  ['localhost','127.0.0.1'].includes(location.hostname);
const LA_ARTORIO_ROL_DEMO = LA_ARTORIO_HOST_LOCAL ?
  new URLSearchParams(location.search).get('artorio_demo') : null;
const LA_ARTORIO_DEMO = ['docente','general','superadmin','acceso'].includes(LA_ARTORIO_ROL_DEMO);
const laArtorioUI = {montado:false,ultimoTema:'',preguntas:0,ocupado:false,generacion:0};

function laArtorioPuedeAbrir_(){
  const u=state.user;
  if(!u || u.rol==='acceso')return false;
  if(!['docente','general','direccion'].includes(u.rol) && u.superadmin!==true)return false;
  if(!la237TabAutorizada_('artorio'))return false;
  return LA_ARTORIO_SERVIDOR_HABILITADO || LA_ARTORIO_DEMO;
}

function laArtorioActualizarMenu_(){
  const boton=document.getElementById('tab-artorio');
  if(boton)boton.classList.toggle('hide',!laArtorioPuedeAbrir_());
}

function laArtorioNormalizar_(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
}

function laArtorioBloqueo_(pregunta){
  const q=laArtorioNormalizar_(pregunta);
  if(/\b(modifica|cambia|elimina|borra|guarda|crea|registra|edita|actualiza|desactiva|corrige|anade|agrega|eliminar|modificar|cambiar|guardar)\b/.test(q))
    return '⚔️ Acción denegada: Sir Artorio solo consulta. No puedo alterar horarios, alumnado, docentes ni pases.';
  if(/\b(contrasena|password|clave|token|secreto|credencial)\b/.test(q))
    return '🔒 No puedo mostrar, recibir ni buscar credenciales o secretos institucionales.';
  return '';
}

function laArtorioIntencion_(pregunta){
  const q=laArtorioNormalizar_(pregunta);
  if(/\b(integridad|auditoria|seguridad)\b/.test(q))return 'integridad';
  if(/\b(permiso|permisos|autorizado|autorizados)\b/.test(q))return 'permisos';
  if(/\b(docente|docentes|maestro|maestra|profesor|profesora|imparte)\b/.test(q))return 'docentes';
  if(/\b(grupo|grupos)\b/.test(q) && !/\b(hora|horario|lunes|martes|miercoles|jueves|viernes|clase)\b/.test(q))return 'grupos';
  if(/\b(horario|horarios|lunes|martes|miercoles|jueves|viernes|materia|matematicas|historia|hora|clase)\b/.test(q))return 'horarios';
  return '';
}

function laArtorioFechaConsulta_(pregunta,fechaHoy){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(fechaHoy))throw Error('Fecha escolar inválida.');
  const q=laArtorioNormalizar_(pregunta);
  const dias=['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
  const elegido=dias.findIndex(d=>new RegExp('\\b'+d+'\\b').test(q));
  if(elegido<0)return fechaHoy;
  const [year,month,day]=fechaHoy.split('-').map(Number);
  const fecha=new Date(year,month-1,day,12);
  const actual=(fecha.getDay()+6)%7;
  fecha.setDate(fecha.getDate()+elegido-actual);
  const n=valor=>String(valor).padStart(2,'0');
  return `${fecha.getFullYear()}-${n(fecha.getMonth()+1)}-${n(fecha.getDate())}`;
}

function laArtorioTextoCampo_(valor){
  return String(valor??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,90);
}

function laArtorioRespuestaInstitucional_(consulta,datos){
  if(!datos || datos.success!==true || !Array.isArray(datos.clases) || !Array.isArray(datos.grupos) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(String(datos.fecha||'')))
    throw Error('El servidor no devolvió una consulta académica verificable.');
  const clases=datos.clases.slice(0,150).map(c=>({
    nivel:laArtorioTextoCampo_(c.nivel),grupo:laArtorioTextoCampo_(c.grupo),
    materia:laArtorioTextoCampo_(c.materia),docente:laArtorioTextoCampo_(c.docente),
    inicio:laArtorioTextoCampo_(c.inicio),fin:laArtorioTextoCampo_(c.fin)
  }));
  const grupos=datos.grupos.slice(0,100).map(g=>({
    nivel:laArtorioTextoCampo_(g.nivel),grado:laArtorioTextoCampo_(g.grado),
    seccion:laArtorioTextoCampo_(g.seccion)
  }));
  const fuente='Fuente: LABASTIDA ASISTENCIA, consulta de clases autorizada del '+datos.fecha+'.';
  if(consulta==='grupos'||consulta==='permisos'){
    const listado=grupos.map(g=>`${g.nivel} ${g.grado}º ${g.seccion}`.trim());
    return (consulta==='permisos'?'Grupos visibles para esta sesión':'Grupos autorizados')+':\n'+
      (listado.length?listado.slice(0,30).map(x=>'• '+x).join('\n'):'Sin grupos en esta fecha.')+'\n'+fuente;
  }
  if(!clases.length)return 'No hay clases autorizadas para la fecha consultada.\n'+fuente;
  const listado=clases.slice(0,30).map(c=>{
    const cuando=c.inicio ? `${c.inicio}${c.fin?'–'+c.fin:''}` : 'Hora no informada';
    return `• ${c.nivel} ${c.grupo} · ${c.materia||'Módulo'} · ${cuando}`+
      (consulta==='docentes'&&c.docente?' · '+c.docente:'');
  });
  return (consulta==='docentes'?'Docentes y clases asignadas':'Clases de la jornada')+':\n'+
    listado.join('\n')+(clases.length>30?'\nSe muestran los primeros 30 bloques.':'')+'\n'+fuente;
}

function laArtorioRespuestaDemo_(pregunta){
  const q=laArtorioNormalizar_(pregunta);
  if(/\b(modifica|cambia|elimina|borra|guarda|crea|registra|edita|actualiza|desactiva|borra|corrige)\b/.test(q)){
    return {tipo:'blocked',texto:'⚔️ Acción denegada: Sir Artorio está en modo exclusivo de consulta. No puedo modificar horarios, alumnos, docentes, pases ni registros.'};
  }
  if(/\b(contrasena|password|clave|token|secreto|credencial)\b/.test(q)){
    return {tipo:'blocked',texto:'🔒 Nunca muestro ni solicito contraseñas, tokens o secretos institucionales.'};
  }
  if(/\b(integridad)\b/.test(q)){
    laArtorioUI.ultimoTema='integridad';
    return {tipo:'normal',texto:'Integridad del laboratorio ficticio: sin incidencias registradas en la muestra. Esta respuesta NO evalúa los datos reales de LABASTIDA ASISTENCIA.'};
  }
  if(/\b(permiso|permisos)\b/.test(q)){
    laArtorioUI.ultimoTema='permisos';
    return {tipo:'normal',texto:'Permisos de ejemplo: Docente Alfa → 1.º A de Primaria; Docente Beta → 1.º B de Primaria; Docente Gamma → 1.º A de Secundaria. En producción los permisos se comprobarán en el servidor para cada consulta.'};
  }
  if(/\b(docente|docentes|maestro|maestra|profesor|profesora|imparte)\b/.test(q)){
    laArtorioUI.ultimoTema='docentes';
    return {tipo:'normal',texto:'En el laboratorio ficticio, Docente Beta imparte Matemáticas a 1.º B de Primaria. ID QA-DOC-2. No se consultó ninguna ficha del colegio.'};
  }
  if(/\b(grupo|grupos|primero|primaria|secundaria)\b/.test(q) && !/\b(hora|horario|lunes|clase)\b/.test(q)){
    laArtorioUI.ultimoTema='grupos';
    return {tipo:'normal',texto:'Grupos de muestra: 1.º A de Primaria, 1.º B de Primaria y 1.º A de Secundaria. Son identidades inventadas para verificar la pantalla.'};
  }
  if(/\b(horario|horarios|lunes|matematicas|historia|hora|clase)\b/.test(q) ||
    (/\b(a que hora|cuando)\b/.test(q) && laArtorioUI.ultimoTema==='docentes')){
    laArtorioUI.ultimoTema='horarios';
    return {tipo:'normal',texto:'Horarios ficticios del lunes:\n• 1.º A de Primaria — Matemáticas, 7:00 (Docente Alfa).\n• 1.º B de Primaria — Matemáticas, 8:00 (Docente Beta).\n• 1.º A de Secundaria — Historia, 9:00 (Docente Gamma).\nFuente: ejemplo local QA; no son horarios reales.'};
  }
  return {tipo:'normal',texto:'Soy Sir Artorio, tu futuro asistente dentro de LABASTIDA ASISTENCIA. Puedes probar horarios, grupos, docentes, permisos e integridad. Por ahora respondo SOLO con una muestra ficticia local; todavía no tengo acceso a información escolar real.'};
}

function laArtorioBurbuja_(texto,tipo='normal'){
  const lista=document.getElementById('la-artorio-chat');
  if(!lista)return;
  const item=document.createElement('div');
  item.className='la-artorio-message '+tipo;
  item.textContent=texto;
  lista.append(item);
  lista.scrollTop=lista.scrollHeight;
}

function laArtorioLimpiar_(){
  laArtorioUI.generacion++;
  laArtorioUI.ocupado=false;
  laArtorioUI.ultimoTema='';
  laArtorioUI.preguntas=0;
  const chat=document.getElementById('la-artorio-chat');
  if(chat)chat.replaceChildren();
  const campo=document.getElementById('la-artorio-pregunta');
  if(campo)campo.value='';
}

async function laArtorioConsulta_(texto){
  if(!laArtorioPuedeAbrir_())return;
  const pregunta=String(texto||'').trim().slice(0,220);
  if(!pregunta||laArtorioUI.ocupado)return;
  laArtorioBurbuja_(pregunta,'user');
  laArtorioUI.preguntas++;
  const bloqueo=laArtorioBloqueo_(pregunta);
  if(bloqueo){laArtorioBurbuja_(bloqueo,'blocked');return;}
  // Este módulo no envía credenciales, tokens ni información escolar al Worker QA.
  if(LA_ARTORIO_DEMO){
    const respuesta=laArtorioRespuestaDemo_(pregunta);
    laArtorioBurbuja_(respuesta.texto,respuesta.tipo);
    return;
  }
  if(!LA_ARTORIO_SERVIDOR_HABILITADO){
    laArtorioBurbuja_('Conexión escolar todavía desactivada. La candidata no consulta producción.','blocked');
    return;
  }
  const intencion=laArtorioIntencion_(pregunta);
  if(intencion==='integridad'){
    laArtorioBurbuja_('El módulo de integridad requiere una auditoría de servidor separada y no está habilitado. No se infiere seguridad a partir de los horarios.','blocked');
    return;
  }
  if(!intencion){
    laArtorioBurbuja_('Por ahora solo puedo consultar horarios, grupos, docentes y grupos autorizados. La conversación general con IA permanece desactivada.');
    return;
  }
  // Ruta existente de LABASTIDA: el Worker institucional entrega el token
  // únicamente al Apps Script original, que valida sesión y ámbito cada vez.
  const generacion=laArtorioUI.generacion,token=state.token,usuario=state.user?.usuario;
  laArtorioUI.ocupado=true;
  const boton=document.querySelector('#la-artorio-form button');
  if(boton)boton.disabled=true;
  try{
    const fecha=laArtorioFechaConsulta_(pregunta,la14FechaLocal());
    const resultado=await api('la231Clases',{fecha});
    if(generacion!==laArtorioUI.generacion || token!==state.token || usuario!==state.user?.usuario)return;
    if(resultado.fecha!==fecha)throw Error('El servidor respondió con una fecha distinta.');
    laArtorioBurbuja_(laArtorioRespuestaInstitucional_(intencion,resultado));
  }catch(err){
    if(generacion===laArtorioUI.generacion && token===state.token)
      laArtorioBurbuja_('No pude verificar la consulta institucional: '+String(err?.message||'Error de conexión')+'.','blocked');
  }finally{
    if(generacion===laArtorioUI.generacion){laArtorioUI.ocupado=false;if(boton)boton.disabled=false;}
  }
}

function laArtorioMontar_(){
  if(laArtorioUI.montado)return;
  const raiz=document.getElementById('la-artorio-root');
  if(!raiz)return;
  raiz.innerHTML=`
    <div class="la-artorio-layout">
      <div class="la-artorio-card">
        <div class="la-artorio-heading">
          <h2 id="la-artorio-titulo">Consultas con Sir Artorio</h2>
          <span class="la-artorio-tag" id="la-artorio-estado">Muestra ficticia QA</span>
        </div>
        <p class="la-artorio-notice">Un asistente dentro de tu aplicación, sin segunda contraseña. Las consultas escolares serán verificadas por el servidor y limitadas a tus permisos.</p>
        <div id="la-artorio-chat" class="la-artorio-chat" role="log" aria-live="polite" aria-label="Conversación de Sir Artorio"></div>
        <div class="la-artorio-chips" aria-label="Consultas de ejemplo">
          <button type="button" data-artorio-pregunta="Horarios del lunes">Horarios</button>
          <button type="button" data-artorio-pregunta="Grupos">Grupos</button>
          <button type="button" data-artorio-pregunta="¿Quién imparte Matemáticas en primero B?">Docentes</button>
          <button type="button" data-artorio-pregunta="Permisos">Permisos</button>
          <button type="button" data-artorio-pregunta="Integridad">Integridad</button>
        </div>
        <form id="la-artorio-form" class="la-artorio-form">
          <input id="la-artorio-pregunta" type="text" autocomplete="off" maxlength="220" aria-label="Pregunta para Sir Artorio" placeholder="Ej.: ¿a qué hora es Matemáticas?">
          <button type="submit">Consultar</button>
        </form>
        <p id="la-artorio-nota" class="la-artorio-note">Las respuestas de esta candidata son simuladas. Escrituras y conversación general con IA deshabilitadas.</p>
      </div>
      <aside class="la-artorio-card la-artorio-portrait" aria-label="Presentación de Sir Artorio">
        <img src="assets/sir-artorio.png" alt="Sir Artorio, caballero azul y dorado, guardián de la información académica">
        <h3>Sir Artorio</h3>
        <p>Guardián de la información académica</p>
        <div class="la-artorio-security">🛡️ <strong>Permisos institucionales</strong><br>Los docentes solo podrán consultar sus grupos. Dirección tendrá su ámbito autorizado. El acceso de puerta no habilita consultas académicas. Ningún dato será enviado a Gemini en esta etapa.</div>
      </aside>
    </div>`;
  document.getElementById('la-artorio-form').addEventListener('submit',e=>{
    e.preventDefault();const campo=document.getElementById('la-artorio-pregunta');
    laArtorioConsulta_(campo.value);campo.value='';campo.focus();
  });
  raiz.querySelectorAll('[data-artorio-pregunta]').forEach(b=>b.addEventListener('click',()=>{
    laArtorioConsulta_(b.getAttribute('data-artorio-pregunta'));
  }));
  laArtorioUI.montado=true;
}

function laArtorioAbrir_(){
  if(!laArtorioPuedeAbrir_())return;
  laArtorioMontar_();
  document.getElementById('la-artorio-estado').textContent=LA_ARTORIO_DEMO ?
    'Muestra ficticia QA' : 'Solo lectura';
  document.getElementById('la-artorio-nota').textContent=LA_ARTORIO_DEMO ?
    'Las respuestas de esta candidata son simuladas. Escrituras y conversación general con IA deshabilitadas.' :
    'Consultas de clases autorizadas verificadas por el servidor institucional. Sin escrituras ni conversación general con IA.';
  if(!laArtorioUI.preguntas && !document.getElementById('la-artorio-chat').children.length){
    laArtorioBurbuja_(LA_ARTORIO_DEMO ?
      '⚔️ ¡Bienvenido, noble visitante! Esta es una muestra ficticia, sin acceso al colegio.' :
      '⚔️ ¡Bienvenido, noble visitante! Soy Sir Artorio. Puedo consultar horarios y grupos que tu sesión tenga autorizados. No puedo modificar registros ni consultar datos personales del alumnado.');
  }
}

// Prueba visual local sin credenciales ni conexiones externas.
if(LA_ARTORIO_DEMO){
  const perfil=LA_ARTORIO_ROL_DEMO;
  const esPuerta=perfil==='acceso';
  state.token=null;
  state.data=null;
  state.user={usuario:'SIMULACION_LOCAL',rol:esPuerta?'acceso':perfil==='docente'?'docente':'general',
    nivel:'Primaria',nombre:perfil==='docente'?'Docente de ejemplo':'Cuenta simulada',
    superadmin:perfil==='superadmin',perfilPersonalizado:false,permisos:[],niveles:['Primaria']};
  document.querySelector('.header .tag').textContent='CANDIDATA SIR ARTORIO · DEMO LOCAL';
  show('app');
  document.querySelectorAll('.view').forEach(v=>v.classList.add('hide'));
  document.querySelectorAll('#nav [data-tab]').forEach(b=>b.classList.add('hide'));
  laArtorioActualizarMenu_();
  if(esPuerta){
    const raiz=document.getElementById('la-artorio-root');
    raiz.textContent='Acceso denegado en la prueba: las cuentas de puerta no tienen acceso a Sir Artorio.';
    document.getElementById('view-artorio').classList.remove('hide');
  }else{
    tab('artorio');
  }
  document.getElementById('username').textContent='SIMULACIÓN LOCAL · '+perfil.toUpperCase();
  document.getElementById('logout').addEventListener('click',()=>{
    // No hay credenciales ni sesión de producción que revocar en modo demo.
    laArtorioLimpiar_();
  });
}
