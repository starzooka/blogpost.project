const LIGHT_AURORA =
  'radial-gradient(circle at 20% 30%, #ff9a9e 0%, transparent 40%), radial-gradient(circle at 80% 40%, #a18cd1 0%, transparent 40%), radial-gradient(circle at 40% 80%, #fad0c4 0%, transparent 40%), #ffffff';

function GradientBackground({ children }) {
  return (
    <div className="gradient-background-root">
      <div
        className="gradient-background-layer"
        style={{ background: LIGHT_AURORA }}
      />
      <div className="gradient-background-content">
        {children}
      </div>
    </div>
  );
}

export default GradientBackground;