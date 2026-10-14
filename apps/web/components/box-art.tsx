import { Icon } from "./icon";
export function BoxArt() {
  return (
    <div className="box-art" aria-hidden="true">
      <div className="art-orbit orbit-one" />
      <div className="art-orbit orbit-two" />
      <div className="art-dot dot-one" />
      <div className="art-dot dot-two" />
      <span className="art-spark spark-one">✳</span>
      <span className="art-spark spark-two">✧</span>
      <div className="floating-note note-top">
        <span className="note-icon purple">
          <Icon name="code" />
        </span>
        <span>
          Made for your
          <br />
          <strong>next big idea.</strong>
        </span>
        <span className="note-check">
          <Icon name="check" size={14} />
        </span>
      </div>
      <div className="gift-shadow" />
      <div className="gift">
        <div className="gift-inside" />
        <div className="gift-back" />
        <div className="gift-left-flap" />
        <div className="gift-right-flap" />
        <div className="gift-front">
          <span className="gift-logo">
            <Icon name="sparkles" size={50} />
          </span>
          <span className="gift-label">a little possibility</span>
        </div>
        <div className="gift-side" />
      </div>
      <div className="tool-float float-one">
        <Icon name="sparkles" size={29} />
      </div>
      <div className="tool-float float-two">
        <Icon name="video" size={27} />
      </div>
      <div className="tool-float float-three">
        <Icon name="book" size={25} />
      </div>
      <div className="floating-note note-bottom">
        <span className="note-icon green">
          <Icon name="check" />
        </span>
        <span>
          Less searching.
          <br />
          <strong>More doing.</strong>
        </span>
        <span className="tiny-stars">✦</span>
      </div>
      <div className="art-caption">PICK YOUR CURIOSITY. OPEN WHAT’S NEXT.</div>
    </div>
  );
}
