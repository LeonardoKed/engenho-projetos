export const $ = selector => document.querySelector(selector);
export const money = value => Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export async function api(path, options) {
  const response = await fetch(`/api${path}`, options);
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(data.error || "Erro na operação.");
  return data;
}
export function showMessage(text, type = "") {
  const notice = $("#notice");
  notice.textContent = text;
  notice.className = `notice ${type}`;
}
export function getCart() { return JSON.parse(sessionStorage.getItem("azure-cart") || "[]"); }
export function saveCart(cart) { sessionStorage.setItem("azure-cart", JSON.stringify(cart)); }
export function nav(active) {
  return `<header><a class="brand" href="/catalogo.html"><span class="brand-mark">EP</span><span><strong>Engenho Projetos</strong><small>materiais para ideias que saem do papel</small></span></a><nav><a class="${active === "catalogo" ? "active" : ""}" href="/catalogo.html">Catálogo</a><a class="${active === "checkout" ? "active" : ""}" href="/checkout.html">Checkout</a><a class="${active === "admin" ? "active" : ""}" href="/administracao.html">Administração</a><a class="${active === "cliente" ? "active" : ""}" href="/cliente.html">Área do cliente</a></nav></header>`;
}
