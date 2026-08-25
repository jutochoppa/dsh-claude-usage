export const STYLE_ID = 'dsh-claude-usage/client'

export const styles = `
.dcl-footer-action-anchor{box-sizing:border-box;width:28px;height:28px;visibility:hidden;position:fixed;z-index:900}
.dcl-usage-root{display:inline-flex;position:relative;flex:none}
.dcl-meter{width:28px;height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:transparent;border:0;border-radius:999px;padding:0;place-items:center;display:grid;position:relative;transition:background .15s ease}
.dcl-usage-root:hover .dcl-meter,.dcl-usage-root:focus-within .dcl-meter{background:var(--dsw-alias-interactive-bg-hover)}
.dcl-ring{position:absolute;inset:2px;transform:rotate(-90deg)}
.dcl-track{fill:none;stroke:var(--dsw-alias-border-l3);stroke-width:2}
.dcl-fill{fill:none;stroke:var(--dsw-alias-label-tertiary);stroke-width:2;stroke-linecap:round;transition:stroke-dashoffset .35s ease,stroke .2s ease}
.dcl-fill-warn{stroke:var(--dsw-static-orange-500,#f59e0b)}
.dcl-fill-critical{stroke:var(--dsw-static-red-500,#ef4444)}
.dcl-logo{width:12px;height:12px;color:#d97757;z-index:1}
.dcl-panel{z-index:1100;box-sizing:border-box;width:min(320px,calc(100vw - 24px),var(--dcl-panel-available-width,320px));max-height:min(520px,calc(100vh - 32px));overflow:auto;border:1px solid var(--dsw-alias-border-inverted);background:var(--dsw-specific-menu);box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-secondary);cursor:default;border-radius:12px;padding:14px;position:absolute;bottom:calc(100% + 8px);right:0;text-align:left;font-size:12px;line-height:18px}
.dcl-panel-header{display:flex;align-items:flex-start;gap:10px;margin-bottom:12px}
.dcl-panel-title{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600;line-height:18px}
.dcl-panel-subtitle{color:var(--dsw-alias-label-tertiary);margin-top:1px}
.dcl-live{width:7px;height:7px;border-radius:50%;background:#22c55e;margin-top:5px;box-shadow:0 0 0 3px color-mix(in srgb,#22c55e 18%,transparent);flex:none}
.dcl-live-stale{background:var(--dsw-static-orange-500,#f59e0b);box-shadow:none}
.dcl-spinner{width:14px;height:14px;border:2px solid var(--dsw-alias-border-l3);border-top-color:var(--dsw-alias-label-secondary);border-radius:50%;animation:dcl-spin .8s linear infinite;margin:8px auto}
@keyframes dcl-spin{to{transform:rotate(360deg)}}
.dcl-error{padding:9px 10px;border-radius:8px;background:color-mix(in srgb,var(--dsw-static-red-500,#ef4444) 10%,transparent);color:var(--dsw-alias-label-secondary);margin-bottom:10px;overflow-wrap:anywhere}
.dcl-bucket{padding:10px 0;border-top:1px solid var(--dsw-alias-border-l3)}
.dcl-bucket:first-of-type{border-top:0;padding-top:0}
.dcl-bucket-title{display:flex;justify-content:space-between;gap:12px;color:var(--dsw-alias-label-primary);font-weight:500;margin-bottom:7px}
.dcl-window{margin-top:8px}
.dcl-window-head{display:flex;justify-content:space-between;gap:10px}
.dcl-percent{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary);font-weight:500}
.dcl-bar{height:4px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover);overflow:hidden;margin:5px 0 3px}
.dcl-bar-fill{height:100%;border-radius:999px;background:var(--dsw-static-blue-450,#5b8def)}
.dcl-bar-warn{background:var(--dsw-static-orange-500,#f59e0b)}
.dcl-bar-critical{background:var(--dsw-static-red-500,#ef4444)}
.dcl-reset{color:var(--dsw-alias-label-tertiary)}
.dcl-bucket-meta{display:grid;grid-template-columns:1fr auto;gap:3px 12px;margin:9px 0 0;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l3)}
.dcl-bucket-meta dt{color:var(--dsw-alias-label-tertiary)}
.dcl-bucket-meta dd{margin:0;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;text-align:right}
.dcl-meta{display:grid;grid-template-columns:1fr auto;gap:4px 12px;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l3)}
.dcl-meta dt{color:var(--dsw-alias-label-tertiary)}
.dcl-meta dd{margin:0;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;text-align:right}
.dcl-credit-list{margin-top:10px;padding-top:9px;border-top:1px solid var(--dsw-alias-border-l3)}
.dcl-credit-heading{color:var(--dsw-alias-label-primary);font-weight:500;margin-bottom:6px}
.dcl-credit{padding:7px 0}
.dcl-credit+.dcl-credit{border-top:1px solid var(--dsw-alias-border-l3)}
.dcl-credit>div{display:flex;justify-content:space-between;gap:8px;color:var(--dsw-alias-label-primary)}
.dcl-credit strong{font-weight:500}.dcl-credit p{margin:3px 0;color:var(--dsw-alias-label-secondary)}
.dcl-credit small{color:var(--dsw-alias-label-tertiary);font-size:11px}
.dcl-footer{color:var(--dsw-alias-label-tertiary);font-size:11px;margin-top:10px;padding-top:9px;border-top:1px solid var(--dsw-alias-border-l3);display:flex;justify-content:space-between;gap:8px}
.dcl-empty{padding:8px 0;color:var(--dsw-alias-label-tertiary)}
.dcl-settings-card{list-style:none;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;color:var(--dsw-alias-label-primary);transition:border-color .16s,background .16s}
.dcl-settings-card:hover{border-color:var(--dsw-alias-label-dimmed)}
.dcl-settings-card[data-open=true]{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}
.dcl-settings-header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:transparent;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}
.dcl-settings-header:focus-visible,.dcl-settings-input:focus-visible,.dcl-settings-button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dcl-settings-heading{display:flex;flex:1;min-width:0;flex-direction:column;gap:4px}
.dcl-settings-title{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}
.dcl-settings-description,.dcl-settings-hint,.dcl-settings-status{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5}
.dcl-settings-description{font-size:13px}
.dcl-settings-pending{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}
.dcl-settings-chevron{width:16px;height:16px;color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}
.dcl-settings-card[data-open=true] .dcl-settings-chevron{transform:rotate(180deg)}
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
