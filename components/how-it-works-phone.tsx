import { OssiPortrait } from "./ossi-portrait";

export function HowItWorksPhone() {
  return (
    <div className="help-phone-visual" data-testid="how-it-works-phone" aria-hidden="true">
      <div className="voice-phone ready help-phone-preview">
        <span className="voice-phone-side voice-phone-side-volume" />
        <span className="voice-phone-side voice-phone-side-power" />
        <div className="voice-phone-screen">
          <div className="voice-phone-statusbar">
            <span>09:41</span>
            <span className="voice-phone-signal"><i /><i /><i /></span>
          </div>
          <span className="voice-phone-island" />
          <div className="voice-portrait">
            <OssiPortrait variant="heading" decorative />
          </div>
          <div className="voice-session-shade" />
          <div className="voice-phone-header">
            <p className="eyebrow light"><span /> Voice Session</p>
            <div className="voice-status ready"><i /> Bereit</div>
          </div>
          <div className="voice-copy">
            <h2>Ossi ist bereit.</h2>
            <p>Du übernimmst den Vertrieb. Ossi spielt dein Gegenüber.</p>
          </div>
          <div className="sound-bars">
            {Array.from({ length: 12 }, (_, index) => <i key={index} />)}
          </div>
          <div className="voice-phone-controls">
            <span className="voice-call-button start">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M7.1 3.3 9.6 3c.7-.1 1.4.4 1.6 1.1l.8 3.1c.2.7-.1 1.4-.7 1.8l-1.7 1a14.8 14.8 0 0 0 4.4 4.4l1-1.7c.4-.6 1.1-.9 1.8-.7l3.1.8c.7.2 1.2.9 1.1 1.6l-.3 2.5c-.1.9-.8 1.6-1.7 1.7C11.6 19.4 4.6 12.4 5.4 5c.1-.9.8-1.6 1.7-1.7Z" />
              </svg>
            </span>
            <strong>Ossi anrufen</strong>
            <small>Voice-Training starten</small>
          </div>
          <span className="voice-phone-home" />
        </div>
      </div>
    </div>
  );
}
