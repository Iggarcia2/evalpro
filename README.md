# EvalPro — Evaluación económica de proyectos de ingeniería

Aplicación web estática para evaluar proyectos comerciales, de autoconsumo y mixtos. Se puede publicar directamente con **GitHub Pages**, sin backend ni compilación.

## Estructura

```text
evalpro-github/
├── index.html                  # Página principal y estructura visual
├── assets/
│   ├── css/
│   │   └── styles.css          # Estilos propios y ayudas visuales
│   └── js/
│       └── app.js              # Cálculos financieros, vistas y guardado local
├── .gitignore                  # Evita incluir archivos financieros privados
└── README.md                   # Estas instrucciones
```

## Probar en tu computadora

1. Abrí `index.html` en un navegador moderno. Para máxima compatibilidad podés usar un servidor web local, por ejemplo `python -m http.server 8000` desde esta carpeta y abrir `http://localhost:8000`.
2. La conexión a Internet es necesaria para cargar **Tailwind CSS** y **Chart.js** desde sus CDN. No necesitás instalar paquetes ni ejecutar `npm`.
3. Completá **Datos generales**, seguí los pasos de carga, y consultá **Resultados**.

## Publicar en GitHub Pages

1. Creá un repositorio en GitHub, por ejemplo `evalpro`.
2. **Descomprimí el ZIP** y subí **el contenido** de `evalpro-github` a la raíz del repositorio: `index.html`, la carpeta `assets/`, `README.md` y `.gitignore`. Conservá la estructura de carpetas; **no** subas el ZIP como único archivo.
3. En el repositorio ingresá a **Settings → Pages → Build and deployment**. Elegí **Deploy from a branch**, rama `main`, carpeta `/(root)` y guardá.
4. Una vez publicado, abrí `https://TU-USUARIO.github.io/evalpro/` (sustituí `TU-USUARIO` y, si corresponde, el nombre del repositorio). La publicación puede tardar unos minutos.

### Alternativa: subir con Git

Desde dentro de la carpeta `evalpro-github`, una vez creado el repositorio remoto vacío:

```bash
git init
git add index.html assets README.md .gitignore
git commit -m "Publicar EvalPro"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/evalpro.git
git push -u origin main
```

Luego activá GitHub Pages como se indica arriba.

## Datos y privacidad

- **No subas** archivos con datos reales de Terraciclo, JSON exportados, planillas o presupuestos privados a un repositorio público. Este proyecto NO incluye datos financieros reales.
- EvalPro usa **almacenamiento local del navegador** para guardar los datos. No hay cuentas de usuario ni sincronización con un servidor. **Exportá un JSON como respaldo** antes de borrar datos del navegador o cambiar de dispositivo.
- Los datos guardados al abrir `index.html` como archivo local no se trasladan solos a la URL de GitHub Pages: exportalos desde la versión anterior e importalos en la nueva.
- El archivo `.gitignore` ayuda a evitar agregados accidentales mediante Git, pero no impide que alguien suba archivos privados manualmente por la web.

## Funcionalidades principales

- Navegación por etapas y ayuda contextual sobre campos.
- CAPEX, vida útil económica y contable, reinversiones y reventa.
- Cronograma de construcción y entrada gradual en operación.
- Personal con fechas de inicio y fin; SAC semestral y proporcional por meses completos.
- Costos fijos, variables y ventas; proyectos comerciales, autoconsumo o mixtos.
- Capital de trabajo automático por plazos de cobro/pago/inventario, o manual.
- Flujo de fondos, VAN, TIR, Payback, escenarios, gráficos y exportaciones.

## Mantenimiento

- Modificá `assets/css/styles.css` para estilos y `assets/js/app.js` para lógica y pantallas.
- `index.html` contiene la estructura principal y las referencias a archivos.
- Al publicar cambios, GitHub Pages reconstruye automáticamente el sitio desde `main`.
- Para recargar archivos tras cambios, actualizá el navegador con **Ctrl + F5** si quedó una versión en caché.

**Nota:** EvalPro es una herramienta de modelización y sus resultados dependen de los supuestos cargados; no reemplaza una revisión profesional tributaria o financiera.
