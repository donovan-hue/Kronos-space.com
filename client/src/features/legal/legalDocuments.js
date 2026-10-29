/**
 * DOCUMENTOS LEGALES — Términos, Privacidad y Cookies.
 *
 * Fuente de verdad: el código del propio despliegue, no una plantilla. Cada
 * afirmación de estos textos tiene su correspondencia en el árbol:
 *
 *  · audiencias de publicación ......... `server/src/modules/posts/audience.service.js`
 *  · media pública por diseño .......... `server/src/middleware/mediaAcl.js`, `docs/LIMITES-Y-DEUDA.md` §2
 *  · cookie de media ................... `server/src/middleware/mediaAuth.js`
 *  · almacenamiento de sesión .......... `client/src/services/authStorage.js`
 *  · exportación y borrado ............. `server/src/modules/export/`, `server/src/modules/users/users.routes.js`
 *  · apoyos simbólicos ................. `server/src/modules/support/support.routes.js`
 *  · federación de solo lectura ........ `server/src/modules/federation/federation.routes.js`
 *  · proveedores de IA ................. `server/src/config/aiProviders.js`, `server/src/config/openrouter.js`
 *
 * Por eso estos textos dicen lo que el sistema hace hoy y nombran lo que todavía
 * no hace (sin pasarela de pago, sin verificación obligatoria de correo, sin
 * doble factor). Cambiar el comportamiento exige cambiar el documento en el
 * mismo commit.
 */

export const VERSION_LEGAL = "2026-10-29";

export const LEGAL_DOCS = {
  terminos: {
    slug: "terminos",
    title: "Términos del servicio",
    eyebrow: "KRONOS-SPACE · CONDICIONES DE USO",
    intro:
      "Estas condiciones explican qué es Kronos Space, qué puedes hacer aquí y qué nos comprometemos a cuidar. No son un muro de texto legal: cada apartado describe una parte real de la plataforma.",
    sections: [
      {
        heading: "Qué es Kronos Space",
        paragraphs: [
          "Kronos Space es una red social con herramientas de creación asistidas por IA: publicaciones con foto, video, encuestas y eventos; historias; mensajes directos y grupales; círculos; cápsulas del tiempo; transmisiones en vivo; proyectos de guion y un estudio de edición.",
          "La única dirección pública para las personas es https://kronos-space.com. El subdominio api.kronos-space.com es infraestructura interna y no es una segunda página."
        ]
      },
      {
        heading: "Tu cuenta",
        paragraphs: [
          "Puedes crear una cuenta con correo y contraseña o continuar con Google. Eres responsable de guardar tu contraseña y de cerrar sesión en dispositivos compartidos.",
          "En Ajustes > Seguridad y dispositivos puedes ver las sesiones abiertas y cerrar cualquiera de ellas. Al cerrar sesión, el token de esa sesión deja de funcionar en todas las rutas protegidas."
        ],
        list: [
          "Recomendamos verificar el correo; así puedes restablecer la contraseña por tu cuenta.",
          "Hoy la plataforma no exige verificación de correo para publicar y no ofrece doble factor de autenticación.",
          "Un usuario, una identidad: no crees cuentas para eludir una restricción de moderación."
        ]
      },
      {
        heading: "Lo que publicas sigue siendo tuyo",
        paragraphs: [
          "Conservas los derechos de lo que subes y publicas. Al publicarlo nos concedes una licencia no exclusiva para mostrarlo, almacenarlo y distribuirlo dentro de la plataforma, con la única finalidad de que el servicio funcione.",
          "Esa licencia termina cuando borras la publicación y la copia durable deja de servirla, salvo en lo imposible de deshacer (por ejemplo, republicaciones hechas por otras cuentas)."
        ]
      },
      {
        heading: "Audiencias: qué puede verse y qué no",
        paragraphs: [
          "Cada publicación elige su audiencia: pública, solo seguidores, círculos concretos o solo tú. La plataforma filtra el contenido en el servidor, no en la interfaz.",
          "Los archivos que subes se sirven por URL sin firma: lo que publicas con audiencia pública queda accesible para cualquiera que tenga el enlace. No subas material que necesite ser privado.",
          "Los adjuntos de mensajes directos, las historias, los borradores y la media de audiencias restringidas no se sirven en público: requieren tu sesión."
        ]
      },
      {
        heading: "Kairos y las herramientas de IA",
        paragraphs: [
          "Kairos genera guiones, imágenes, locuciones y, cuando su proveedor esté configurado, video. Las peticiones de guion e imagen viajan a OpenRouter y el chat a Google Gemini: tus textos y prompts se envían a esos proveedores con la finalidad de generar el resultado.",
          "La generación consume recursos de pago y por eso está sujeta a un presupuesto por capacidad. Superado el límite, la plataforma responde con un aviso y espera; no hay cargo económico para ti.",
          "Los resultados generados no son revisados por personas antes de publicarse y pueden ser inexactuos, ofensivos o equivocados. Son tuyos: decides si los usas y cómo los etiquetas.",
          "Cuando publicas un resultado generado, la plataforma lo marca como contenido creado con IA y conserva la atribución en las remezclas."
        ]
      },
      {
        heading: "Apoyos y créditos",
        paragraphs: [
          "Los apoyos entre cuentas se expresan en créditos Kronos (★). Son simbólicos: la plataforma no tiene pasarela de pago, no cobra, no transfiere dinero y no emite reembolsos.",
          "Ningún apartado del producto debe interpretarse como una promesa de ingreso para quien crea contenido."
        ]
      },
      {
        heading: "Convivencia y moderación",
        paragraphs: [
          "Puedes reportar una publicación o una cuenta, bloquear a alguien, silenciarlo u ocultar su contenido. Un bloqueo corta la interacción en los dos sentidos, también los avisos.",
          "Las reportes entran en una cola que revisa el equipo de moderación. Podemos ocultar contenido, retirar una cuenta o limitar funciones cuando se incumplen estas condiciones o la ley aplicable.",
          "La plataforma no filtra de forma automática el contenido antes de publicarse: la detección es reactiva (reportes y revisión humana)."
        ]
      },
      {
        heading: "Federación",
        paragraphs: [
          "Tu perfil y tus publicaciones públicas pueden leerse desde otros servidores compatibles con ActivityPub a través del perfil público de la plataforma.",
          "La federación es de solo lectura: este servidor no procesa actividades entrantes de otras instancias, y el buzón de entrada responde con un código 501 que lo declara en lugar de fingir que funciona."
        ]
      },
      {
        heading: "Datos, exportación y eliminación",
        paragraphs: [
          "Puedes descargar un archivo con tus datos desde Ajustes > Privacidad y datos. El paquete contiene lo tuyo y nada ajeno.",
          "Puedes eliminar tu cuenta desde ese mismo apartado. La eliminación borra perfil, publicaciones, historias, mensajes propios, borradores, proyectos, generaciones, avisos, colecciones y archivos asociados, y revoca tus sesiones. No es reversible."
        ]
      },
      {
        heading: "Disponibilidad y cambios",
        paragraphs: [
          "La plataforma se ofrece como está, sin garantía de funcionamiento ininterrumpido. Mantenimientos, límites de peticiones y caídas de proveedores externos pueden afectar funciones concretas; el estado verificable está en /estado.",
          "Si cambiamos estas condiciones, la versión vigente es la que aparece aquí, con su fecha. El uso continuado después del cambio implica la aceptación del texto publicado."
        ]
      },
      {
        heading: "Contacto",
        paragraphs: [
          "Escríbenos desde la pantalla de ayuda de la aplicación o a traves del enlace de contacto publicado en el perfil de la plataforma. Para asuntos de datos personales, indica el nombre de usuario afectado."
        ]
      }
    ]
  },

  privacidad: {
    slug: "privacidad",
    title: "Aviso de privacidad",
    eyebrow: "KRONOS-SPACE · TRATAMIENTO DE DATOS",
    intro:
      "Qué guardamos, para qué lo usamos, con quién viaja y cómo recuperas o eliminas lo tuyo. Este aviso describe el tratamiento real del despliegue; no es una lista genérica de terceros.",
    sections: [
      {
        heading: "Datos que guardamos",
        paragraphs: ["Se conservan únicamente los datos que hacen funcionar la cuenta y el contenido:"],
        list: [
          "Identidad: nombre de usuario, nombre visible, biografía, avatar y portada.",
          "Credenciales: hash de contraseña con bcrypt y el identificador estable de Google cuando inicias sesión con Google. La contraseña en texto plano no se almacena ni se muestra.",
          "Correo electrónico, usado para iniciar sesión, verificar la cuenta y restablecer la contraseña.",
          "Contenido: publicaciones, comentarios, reacciones, historias, mensajes, borradores, proyectos, cápsulas, archivos y generaciones de IA.",
          "Preferencias: idioma, tema, movimiento reducido, notificaciones, intereses del feed, visibilidad del perfil y personalidad del asistente.",
          "Metadatos de sesión: agente de usuario y dirección IP de origen, para listar dispositivos y aplicar límites de abuso."
        ]
      },
      {
        heading: "Con qué finalidad",
        paragraphs: [
          "Operar el servicio y mostrar tu contenido a la audiencia que elegiste; proteger la cuenta y la plataforma con límites de peticiones y revocación de sesiones; entregar avisos dentro de la aplicación; y cumplir las obligaciones legales aplicables.",
          "No construimos perfiles publicitarios ni vendemos datos personales. No hay publicidad de terceros en la plataforma."
        ]
      },
      {
        heading: "Base del tratamiento en la Unión Mexicana y otras jurisdicciones",
        paragraphs: [
          "El tratamiento descansa en la ejecución del contrato del servicio (sin estos datos no hay cuenta ni contenido) y en el interés legítimo de mantener la plataforma segura y en funcionamiento.",
          "Cuando usas Kairos, aceptas explícitamente que el texto que escribas y tus indicaciones se transmitan al proveedor de IA correspondiente para generar el resultado."
        ]
      },
      {
        heading: "Destinatarios del encargo",
        paragraphs: ["El contenido no se comparte con terceros con fines ajenos a prestar el servicio. Los que intervienen son:"],
        list: [
          "OpenRouter: generación de guion, imagen y locución.",
          "Google Gemini: conversación con el asistente.",
          "El proveedor de video configurado para la generación de video; si no está configurado, la capacidad se declara no disponible y no se envía nada.",
          "Resend: correos de verificación y restablecimiento de contraseña.",
          "Google: inicio de sesión con Google Identity Services.",
          "Los proveedores de hospedaje donde viven la aplicación, la API y la base de datos."
        ]
      },
      {
        heading: "Cuánto tiempo",
        paragraphs: [
          "Las publicaciones y el contenido permanecen mientras existan tu cuenta y tu decisión de conservarlos.",
          "Las historias caducan a las 24 horas; el archivo personal conserva lo que decidiste guardar.",
          "Los tokens de sesión se revocan al cerrar sesión y caducan según la configuración del servidor. Las notificaciones pueden estar sujetas a una política de expiración configurable.",
          "Los archivos se eliminan junto con la publicación o la cuenta; la copia durable se purga con el mismo criterio."
        ]
      },
      {
        heading: "Tus derechos",
        paragraphs: [
          "Acceso y portabilidad: descarga un archivo JSON con tu contenido desde Ajustes > Privacidad y datos.",
          "Supresión: elimina tu cuenta desde Ajustes. Se borran perfil, contenido propio, relaciones, archivos y sesiones; los mensajes que otras cuentas conservan en su propia bandeja se limpian de tus datos.",
          "Oposición y control: ajusta la visibilidad del perfil, silencia, bloquea u oculta contenido sin borrar nada.",
          "Reclamaciones: puedes dirigirte a la autoridad de protección de datos de tu país. Antes, escríbenos por el canal de contacto de la plataforma."
        ]
      },
      {
        heading: "Menores",
        paragraphs: [
          "El servicio no está dirigido a menores de 13 años. Si detectamos una cuenta de una persona menor de esa edad, la eliminamos junto con su contenido cuando no podemos verificar la edad."
        ]
      },
      {
        heading: "Cómo protegemos la información",
        paragraphs: [
          "Contraseñas con bcrypt, sesiones con rotación de token de refresco y revocación efectiva en todas las rutas, límites de peticiones por ventana, validación de tipo y firma de los archivos que subes, y aislamiento de la media restringida detrás de una sesión verificada.",
          "Límites conocidos que preferimos declarar antes que adornar: los archivos publicados con audiencia pública se sirven sin firma, no hay doble factor de autenticación y la verificación del correo no es obligatoria para publicar."
        ]
      },
      {
        heading: "Cambios de este aviso",
        paragraphs: [
          "Cuando el tratamiento de datos cambie, se actualizará este aviso con su fecha de versión. Los cambios sustanciales se anuncian dentro de la plataforma antes de que resulten aplicables."
        ]
      }
    ]
  },

  cookies: {
    slug: "cookies",
    title: "Cookies y almacenamiento local",
    eyebrow: "KRONOS-SPACE · ALMACENAMIENTO DEL NAVEGADOR",
    intro:
      "Kronos Space usa una sola cookie y unos pocos elementos de almacenamiento local. No hay cookies de publicidad, de perfilado ni de analítica de terceros, y por eso no hay un panel de consentimiento: no hay nada que consentir además de lo imprescindible.",
    sections: [
      {
        heading: "Cookie indispensable",
        paragraphs: ["Una única cookie, de carácter técnico:"],
        list: [
          "kronos_media_token · sesión · HttpOnly y Secure · se usa para servir los archivos restringidos que te pertenecen (adjuntos de mensajes, historias, borradores y media de audiencias privadas). Sin ella, esa media no se puede mostrar.",
          "Se limpia al cerrar sesión y al eliminar la cuenta, junto con el resto de las credenciales."
        ]
      },
      {
        heading: "Almacenamiento local del navegador",
        paragraphs: [
          "La sesión y tus preferencias se guardan en el almacenamiento del navegador, no en cookies. Puedes borrarlas desde la configuración del navegador en cualquier momento; la consecuencia es cerrar la sesión."
        ],
        list: [
          "kronos_token y kronos_refresh_token · credenciales de la sesión.",
          "kronos_session_expires_at y kronos_refresh_expires_at · marcas de caducidad.",
          "kronos_session_remember · si la sesión debe sobrevivir al cerrar la pestaña.",
          "kronos_user · copia local de tu perfil para pintar la interfaz sin esperar la red.",
          "kronos.motion-preference y kronos_video_muted · movimiento reducido y silencio del video."
        ]
      },
      {
        heading: "Almacenamiento bloqueado",
        paragraphs: [
          "Si el navegador bloquea o deniega el acceso a localStorage y sessionStorage, la aplicación no rompe: sigue funcionando en memoria durante la pestaña y avisa de que la sesión no se conservará al cerrarla."
        ]
      },
      {
        heading: "Lo que no usamos",
        paragraphs: [
          "Ni cookies de terceros, ni píxeles de seguimiento, ni identificadores publicitarios, ni analizadoras externas que envíen tu navegación a otro dominio.",
          "El servidor registra peticiones para su propio diagnóstico operacional (estado, hora y total por código de respuesta). Ese registro vive en la memoria del proceso y no se exporta a un servicio de análisis."
        ]
      },
      {
        heading: "Cómo desactivar lo imprescindible",
        paragraphs: [
          "Puedes bloquear la cookie y el almacenamiento local desde tu navegador, con el resultado de no mantener la sesión iniciada. No hay funciones opcionales que apagar aquí."
        ]
      }
    ]
  }
};

export function legalDoc(slug) {
  return LEGAL_DOCS[slug] || null;
}

export const LEGAL_LINKS = [
  { slug: "terminos", label: "Términos" },
  { slug: "privacidad", label: "Privacidad" },
  { slug: "cookies", label: "Cookies" }
];
