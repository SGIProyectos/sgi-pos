// ========== MÓDULO LETRAS Y ANUNCIOS ==========
// Wrapper minimalista: abre el cotizador especializado en nueva pestaña.
// El cotizador (proyecto separado en cotizador-sgi.onrender.com) es autónomo
// — no depende del POS. Cuando termines de cotizar, si el trabajo se cierra,
// registra el pedido manualmente en Pedidos capturando el folio (SGI-YYYY-NNNN),
// cliente y total. Si en el futuro el volumen justifica automatización, se
// integrará vía Supabase compartida (ver CLAUDE.md de ambos proyectos).

const COTIZADOR_URL = 'https://cotizador-sgi.onrender.com/';

window.ModuleLetras = function ModuleLetras() {
  const abrirCotizador = () => {
    window.open(COTIZADOR_URL, '_blank', 'noopener,noreferrer');
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '60px 40px',
      minHeight: '60vh',
      textAlign: 'center',
    }}>
      <div style={{
        background: 'linear-gradient(135deg, #13203a, #1a2b4a)',
        borderRadius: 16,
        padding: '40px 48px',
        maxWidth: 640,
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
      }}>
        <div style={{ marginBottom: 16, opacity: 0.9 }}>
          <window.IconType size={56} stroke={1.5} style={{ color: '#f5c518' }} />
        </div>
        <h2 style={{
          color: '#eef3fb',
          fontSize: 26,
          fontWeight: 700,
          margin: '0 0 8px',
        }}>
          Cotizador de Letras y Anuncios
        </h2>
        <p style={{
          color: '#9fb0cb',
          fontSize: 14,
          margin: '0 0 24px',
          lineHeight: 1.5,
        }}>
          Sistema especializado para letras 3D, letras planas y cajas de luz.<br />
          Sube el SVG, ingresa medidas reales, genera cotización, orden de trabajo,
          acta de entrega y plano de fabricación.
        </p>

        <button
          onClick={abrirCotizador}
          style={{
            background: 'linear-gradient(135deg, #f5c518, #f0a020)',
            color: '#13203a',
            border: 'none',
            borderRadius: 8,
            padding: '14px 32px',
            fontSize: 16,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(245,197,24,0.3)',
            transition: 'transform 0.1s',
          }}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          Abrir Cotizador ↗
        </button>

        <div style={{
          marginTop: 28,
          paddingTop: 20,
          borderTop: '1px solid rgba(255,255,255,0.1)',
          fontSize: 12,
          color: '#7a8ba8',
          lineHeight: 1.6,
        }}>
          <strong style={{ color: '#c9d5e8' }}>Después de cotizar:</strong><br />
          El cotizador guarda la cotización en su propio sistema y genera los PDFs.
          Cuando el trabajo se cierre, registra el pedido en <em>Pedidos → + Nuevo Pedido</em>
          capturando el folio (<code style={{ color: '#f5c518' }}>SGI-YYYY-NNNN</code>),
          cliente y total.
        </div>
      </div>
    </div>
  );
};
