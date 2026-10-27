/* LABASTIDA 2.2 — control de versión sin service worker ni caché offline.
 * Se carga después del script principal para comprobar bloqueos de captura.
 * Controla solamente la navegación cliente; NO cambia endpoints ni GAS.
 */
(function(root,factory){
  const helpers=factory();
  if(typeof module==='object'&&module.exports)module.exports=helpers;
  if(root)root.LabastidaActualizaciones22=helpers;
  if(typeof document!=='undefined')helpers.iniciar();
})(typeof globalThis!=='undefined'?globalThis:undefined,function(){
  'use strict';
  const VERSION_URL='labastida-version.json';
  const LAST_DAY_KEY='labastida22_ultimo_dia_visto';

  function nuevaRevision(actual,remota){
    return Number.isSafeInteger(actual)&&Number.isSafeInteger(remota)&&remota>actual;
  }
  function puedeRecargar({hayOperacion,haySolicitudSinResolver,sesionActiva,cambioDeDia}){
    if(hayOperacion||haySolicitudSinResolver)return false;
    // Si hay sesión activa del mismo día, la persona decide cuándo terminar.
    return !sesionActiva||cambioDeDia;
  }
  function urlActualizada(url,revision){
    const destino=new URL(url);
    destino.searchParams.set('labastida_revision',String(revision));
    return destino.href;
  }

  function iniciar(){
    const meta=document.querySelector('meta[name="labastida-revision"]');
    const actual=Number(meta?.getAttribute('content'));
    if(!Number.isSafeInteger(actual)||actual<2026000000)return;
    const style=document.createElement('style');
    style.textContent=`
      #lab22-actualizacion{position:fixed;right:12px;bottom:12px;max-width:min(360px,calc(100vw - 24px));z-index:9998;
        font:12px/1.45 system-ui,sans-serif;background:#fff;color:#17385e;border:1px solid #bdd1e0;
        padding:10px 12px;border-radius:10px;box-shadow:0 5px 24px #0b294d2b}
      #lab22-actualizacion.alerta{border:2px solid #ae7022;background:#fff9ea}
      #lab22-actualizacion.error{border-color:#a0a9b8;color:#556273}
      #lab22-actualizacion button{font:inherit;font-weight:750;background:#1c4574;border:0;border-radius:6px;
        color:white;margin:6px 0 0;padding:7px 11px;cursor:pointer;display:block}
      #lab22-actualizacion button[hidden]{display:none}`;
    document.head.append(style);
    const tarjeta=document.createElement('aside');
    tarjeta.id='lab22-actualizacion';tarjeta.setAttribute('role','status');
    tarjeta.setAttribute('aria-live','polite');
    const texto=document.createElement('span');texto.textContent='Comprobando versión de LABASTIDA…';
    const boton=document.createElement('button');boton.type='button';
    boton.textContent='Actualizar ahora';boton.hidden=true;
    tarjeta.append(texto,boton);
    document.body.append(tarjeta);
    let revisionDisponible=null;
    let consultando=false;
    let ultimoChequeo=0;
    let cambioDeDia=false;

    function diaHoy(){
      // Calendario local de la tableta para saber si la sesión quedó de ayer.
      const ahora=new Date();
      const yyyy=ahora.getFullYear(),mm=String(ahora.getMonth()+1).padStart(2,'0');
      return `${yyyy}-${mm}-${String(ahora.getDate()).padStart(2,'0')}`;
    }
    function observarDia(){
      try{
        const anterior=sessionStorage.getItem(LAST_DAY_KEY),hoy=diaHoy();
        if(anterior&&anterior!==hoy)cambioDeDia=true;
        sessionStorage.setItem(LAST_DAY_KEY,hoy);
      }catch(_){/* Algunas tabletas bloquean sessionStorage. */}
    }
    function situacion(){
      const hayOperacion=(typeof state!=='undefined'&&state.pending===true)||
        (typeof la16UI!=='undefined'&&la16UI.ocupado===true);
      let haySolicitudSinResolver=false;
      try{
        // Estos IDs no son contraseñas; NO deben perderse ante errores de red.
        haySolicitudSinResolver=typeof la16PendLeerTodo_==='function'&&
          Object.keys(la16PendLeerTodo_()).length>0;
      }catch(_){haySolicitudSinResolver=true;}
      const sesionActiva=typeof state!=='undefined'&&Boolean(state.token);
      return {hayOperacion,haySolicitudSinResolver,sesionActiva,cambioDeDia};
    }
    function mostrar(mensaje,{alerta=false,error=false,botonVisible=false}={}){
      tarjeta.className=alerta?'alerta':error?'error':'';
      texto.textContent=mensaje;
      boton.hidden=!botonVisible;
    }
    function ejecutarActualizacion(manual){
      if(!revisionDisponible)return;
      const contexto=situacion();
      if(contexto.hayOperacion||contexto.haySolicitudSinResolver){
        mostrar('Hay un registro en curso o una solicitud pendiente. No se recargará: terminar o conciliar primero.',
          {alerta:true,botonVisible:true});
        return;
      }
      if(manual&&contexto.sesionActiva&&
         !confirm('Actualizar LABASTIDA cerrará la sesión de esta pantalla. ¿Continuar?'))return;
      const destino=urlActualizada(location.href,revisionDisponible);
      const revisada=new URL(location.href).searchParams.get('labastida_revision');
      if(revisada===String(revisionDisponible)){
        mostrar('La publicación todavía se está propagando. La tableta no debe entrar en un ciclo de recargas. Intenta nuevamente en unos minutos.',
          {alerta:true,botonVisible:false});
        return;
      }
      mostrar('Cargando la versión nueva…');
      location.replace(destino);
    }
    async function comprobar(forzar=false){
      if(consultando||document.visibilityState==='hidden')return;
      const ahora=Date.now();
      if(!forzar&&ahora-ultimoChequeo<30000)return;
      consultando=true;ultimoChequeo=ahora;observarDia();
      const ctrl=new AbortController();
      const timer=setTimeout(()=>ctrl.abort(),9000);
      try{
        const u=new URL(VERSION_URL,document.baseURI);
        u.searchParams.set('consulta',String(ahora));
        const respuesta=await fetch(u,{cache:'no-store',signal:ctrl.signal});
        if(!respuesta.ok)throw Error('No se pudo consultar el manifiesto de versión.');
        const release=await respuesta.json();
        const remoto=release.revision;
        if(!Number.isSafeInteger(remoto))throw Error('Manifiesto de versión inválido.');
        if(nuevaRevision(actual,remoto)){
          revisionDisponible=remoto;
          const contexto=situacion();
          if(puedeRecargar(contexto)){
            ejecutarActualizacion(false);
          }else{
            mostrar(`Hay nueva versión (${release.version||remoto}). Finaliza la captura y pulsa «Actualizar ahora».`,
              {alerta:true,botonVisible:true});
          }
        }else{
          revisionDisponible=null;
          mostrar(`✓ LABASTIDA ${release.version||actual} · versión vigente`);
        }
      }catch(_){
        mostrar('Versión sin verificar: revisa la conexión a Internet. La captura sigue su control habitual.',
          {error:true});
      }finally{clearTimeout(timer);consultando=false;}
    }
    boton.addEventListener('click',()=>ejecutarActualizacion(true));
    ['focus','pageshow'].forEach(nombre=>window.addEventListener(nombre,()=>void comprobar(true)));
    document.addEventListener('visibilitychange',()=>{
      if(document.visibilityState==='visible')void comprobar(true);
    });
    setInterval(()=>void comprobar(false),5*60*1000);
    void comprobar(true);
  }
  return {nuevaRevision,puedeRecargar,urlActualizada,iniciar};
});
