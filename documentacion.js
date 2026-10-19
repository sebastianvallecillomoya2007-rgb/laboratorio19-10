'use strict';

const documento = String.raw`
LABORATORIO INTEGRADOR #1
Soluciones de Negocio: POO + n8n
Escenario 3: Recepción de cotizaciones por correo electrónico

1. Problema y solución

La empresa recibe solicitudes de cotización por correo. Revisar cada mensaje, confirmar que tenga los datos necesarios, buscar el producto y comprobar el inventario manualmente consume tiempo y puede provocar registros inconsistentes. La solución automatiza la recepción sin formulario: n8n vigila una bandeja IMAP, interpreta el mensaje, verifica que el producto exista en un catálogo externo y consulta el inventario mantenido en JSON Server. Finalmente registra cada solicitud en JSON Server, con estado pendiente, sin_stock o un estado de error que permite identificar qué ocurrió.

DummyJSON (https://dummyjson.com/products/search) se usa como API externa independiente para validar que el producto solicitado existe y obtener su identificador. JSON Server representa el inventario y conserva las cotizaciones. El catálogo externo no determina las existencias disponibles: la decisión de stock siempre sale de JSON Server.

2. Recorrido de los datos

Correo nuevo (IMAP)
  -> Parsear solicitud (Code: nombre, correo, producto, cantidad)
  -> ¿Datos válidos?
     -> No: preparar error_datos -> registrar cotización en JSON Server
     -> Sí: buscar producto en DummyJSON
        -> Evaluar catálogo
        -> ¿Producto existe?
           -> No / API fallida: guardar producto_no_encontrado o error_api
           -> Sí: consultar products?externalId=... en JSON Server
              -> Evaluar inventario con las clases Product y QuoteRequest
              -> Registrar pendiente, sin_stock, producto_no_encontrado o error_inventario

El trigger requiere credenciales IMAP configuradas en n8n. El workflow se importa desde n8n_workflow.json y se deja inactivo hasta configurar esa cuenta. JSON Server debe estar disponible en http://localhost:3000 para n8n; si n8n corre dentro de Docker, reemplazar localhost por host.docker.internal o por el nombre del servicio de JSON Server.

3. Reglas de negocio

1. El correo debe incluir nombre, dirección válida, producto y cantidad.
2. La cantidad debe ser un número entero positivo.
3. El nombre del producto debe coincidir con un producto de la API externa; si no existe, se registra producto_no_encontrado.
4. El producto validado debe estar registrado en el inventario de JSON Server.
5. Si el stock disponible es mayor o igual que la cantidad solicitada, la cotización queda pendiente.
6. Si el stock es menor que la cantidad, queda sin_stock; el workflow no reserva ni descuenta existencias.
7. Si falla la API externa o JSON Server, la solicitud queda registrada como error_api o error_inventario, en vez de perderse.
8. Un correo incompleto o con cantidad inválida queda como error_datos y conserva el motivo.

Las reglas 1, 2, 4 y 5 se implementan en validate(), evaluateProduct() y hasStock() en domain.js. El nodo Evaluar inventario con POO incluye esas mismas clases y reglas para aplicarlas al resultado real del HTTP Request. El Code Parsear solicitud valida los campos antes de consultar servicios. Los nodos HTTP continúan con salida de error para que el workflow pueda convertir fallas externas en registros auditables.

4. Clases y decisiones técnicas

Product modela una fila de inventario con identificador local, identificador externo, nombre y stock. Su método hasStock(cantidad) expresa la regla central de disponibilidad.

QuoteRequest modela una cotización con datos del solicitante, producto, cantidad, fecha, estado y eventual error. validate() devuelve los errores de datos y evaluateProduct(product) clasifica la solicitud como pendiente, sin_stock o producto_no_encontrado. toJSON() define el registro persistido. main.js instancia ambas clases con los datos de db.json y muestra cuatro ejemplos sin necesitar que n8n esté activo: una solicitud disponible, una sin existencias, un producto inexistente y datos inválidos.

La lógica se mantiene duplicada únicamente en el Code node porque el sandbox de n8n no importa módulos locales del repositorio. Se copian las mismas clases y métodos para conservar una única definición conceptual de las reglas; main.js permite probar la versión local antes de importarla. El identificador externo conecta DummyJSON con la fila local y el identificador local se guarda como productId en la cotización. No se descuenta inventario: cotizar no equivale a confirmar una venta.

5. Puesta en marcha y demostración

1. Ejecutar node main.js para demostrar las clases independientemente de n8n.
2. Iniciar JSON Server desde la carpeta del laboratorio: npx json-server db.json --port 3000. Comprobar /products y /quotes en el navegador.
3. Ejecutar node build_workflow.js si se modifica la definición y luego importar n8n_workflow.json en n8n.
4. Abrir Email Trigger IMAP, crear/seleccionar la credencial de la cuenta de prueba y activar el workflow. Mantener accesible el puerto 3000 desde el proceso n8n.
5. Enviar un correo con asunto libre y cuerpo como el siguiente:

Nombre: Ana Solis
Producto: Essence Mascara Lash Princess
Cantidad: 3

Desde: ana@example.com

La cotización creada en /quotes debe aparecer como pendiente. Para demostrar sin_stock, usar Eyeshadow Palette with Mirror (stock 0). Para demostrar producto no encontrado, usar un producto que no figure en DummyJSON. Para error_datos, omitir Cantidad o escribir cero. Para demostrar el manejo de caída de servicio, detener JSON Server durante una ejecución y revisar el registro error_inventario; el workflow también conserva solicitudes cuando DummyJSON falla.

La salida verificable es el registro persistido en JSON Server. El trigger IMAP se prueba realmente al activar el flujo y enviar un correo; las pruebas de main.js no sustituyen esa demostración en n8n.

6. Conclusión para la exposición

La integración más delicada es convertir un mensaje de correo, que puede variar de formato, en datos consistentes y mantener la decisión de negocio igual en la prueba local y en n8n. Separar el parsing de las reglas del dominio ayuda a distinguir errores de entrada, fallas de servicios y falta real de stock. La solución deja trazabilidad sin confundir una cotización con una reserva de inventario.
`;

if (require.main === module) process.stdout.write(documento);
module.exports = documento;
