export default function Home() {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        padding: '20px',
        margin: 0,
        textAlign: 'center',
        backgroundColor: '#f5f5f5'
      }}
    >
      <div
        style={{
          fontSize: 'clamp(24px, 5vw, 56px)',
          fontWeight: 'bold',
          lineHeight: '1.4',
          maxWidth: '90%',
          color: '#333'
        }}
      >
        <p style={{ margin: '10px 0' }}>We don't work with unprofessional people</p>
        <p style={{ margin: '10px 0', fontSize: 'clamp(18px, 4vw, 42px)' }}>আমরা অপেশাদার মানুষদের সাথে আমাদের সময় নষ্ট করি না</p>
      </div>
    </div>
  );
}