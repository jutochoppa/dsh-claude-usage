export const STYLE_ID = 'dsh-claude-usage/client'

export const styles = `
/* Sidebar card, laid out like the Codex usage card. The card stays the slot
   wrapper's direct child so these :has() rules can make it a full-width row. */
.dcl-card{box-sizing:border-box;width:100%;min-width:0;padding:13px 8px 7px;color:inherit;font:inherit;font-family:var(--dsw-font-family,inherit);font-size:12px;font-weight:400;line-height:1.4}
div:has(> .dcl-card){box-sizing:border-box;display:flex;flex-wrap:wrap;align-items:flex-start;flex:0 0 100%;width:100%;min-width:0}
div:has(> .dcl-card) > .dcl-card{flex:0 0 100%}
div:has(> :has(> .dcl-card)){display:flex;flex-wrap:wrap;align-items:flex-start}
.dcl-header{display:flex;align-items:center;gap:6px;min-width:0;min-height:20px;margin-bottom:3px}
.dcl-logo{display:block;width:16px;height:16px;flex:0 0 16px;color:#d97757}
.dcl-title{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:inherit;font-weight:400}
.dcl-notice{margin:0 0 4px;color:inherit;font-size:inherit;opacity:.78;overflow-wrap:anywhere}
.dcl-limit{min-width:0;padding-top:3px}
.dcl-limit+.dcl-limit{margin-top:4px}
.dcl-limit-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:6px;font-size:inherit;font-weight:400}
.dcl-track{width:100%;height:3px;overflow:hidden;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 17%,transparent)}
.dcl-fill{height:100%;border-radius:inherit;background:var(--dsw-alias-state-business-primary);transition:width 180ms ease-out}
.dcl-details{display:flex;align-items:center;justify-content:space-between;gap:4px;margin-top:6px;min-width:0;font-size:inherit;font-variant-numeric:tabular-nums}
.dcl-used,.dcl-reset{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dcl-reset{text-align:right;opacity:.78}
.dcl-card:not(.dcl-wide){padding-right:5px;padding-left:5px}
.dcl-card:not(.dcl-wide) .dcl-header{gap:4px}
.dcl-card:not(.dcl-wide) .dcl-title{display:none}
@media (prefers-reduced-motion:reduce){.dcl-fill{transition:none}}
.dcl-settings-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;color:var(--dsw-alias-label-primary)}
.dcl-settings-header{box-sizing:border-box;width:100%;align-items:center;gap:12px;padding:14px 16px;display:flex}
.dcl-settings-input:focus-visible,.dcl-settings-button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dcl-settings-heading{display:flex;flex:1;min-width:0;flex-direction:column;gap:4px}
.dcl-settings-title{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}
.dcl-settings-description,.dcl-settings-hint,.dcl-settings-status{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5}
.dcl-settings-description{font-size:13px}
.dcl-settings-pending{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}
.dcl-settings-body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding:4px 0 8px}
.dcl-settings-notice{margin:8px 0 4px;padding:9px 11px;border-radius:8px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.5}
.dcl-settings-field{display:flex;align-items:center;gap:14px;padding:12px 0}
.dcl-settings-field+.dcl-settings-field{border-top:1px solid var(--dsw-alias-border-l2)}
.dcl-settings-copy{display:flex;flex:1;min-width:0;flex-direction:column;gap:2px}
.dcl-settings-label{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:1.5}
.dcl-settings-input{appearance:none;box-sizing:border-box;width:min(240px,42%);min-width:130px;height:34px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);padding:6px 10px;font:inherit;font-size:13px;line-height:1.5}
.dcl-settings-input:disabled{cursor:default;opacity:.45}
.dcl-settings-footer{border-top:1px solid var(--dsw-alias-border-l2);display:flex;justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px}
.dcl-settings-error{min-width:0;color:var(--dsw-alias-label-error);flex:1;margin:0;font-size:12px;line-height:1.5}
.dcl-settings-button{appearance:none;font:inherit;cursor:pointer;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);padding:5px 14px;font-size:13px;line-height:1.5}
.dcl-settings-save{border-color:transparent;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}
.dcl-settings-button:disabled{opacity:.4;cursor:default}
@media (max-width:640px){.dcl-settings-field{align-items:stretch;flex-direction:column;gap:7px}.dcl-settings-input{width:100%}.dcl-settings-footer{flex-wrap:wrap}.dcl-settings-error{flex-basis:100%}}
`
