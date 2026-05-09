<template>
  <main class="shell">
    <section class="status">
      <p class="eyebrow">
        WeChatFerry Robot
      </p>
      <h1>微信消息归档服务</h1>
      <p>Nuxt 服务启动后，可按环境变量控制机器人监听，将文本、图片、视频、语音和文件保存到本地归档目录。</p>
    </section>
  </main>
</template>

<style scoped>
.shell {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 32px;
  color: #18212f;
  background: #f6f8fb;
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
    sans-serif;
}

.status {
  width: min(680px, 100%);
  padding: 32px;
  border: 1px solid #dbe3ef;
  border-radius: 8px;
  background: #ffffff;
}

.eyebrow {
  margin: 0 0 12px;
  color: #54657a;
  font-size: 14px;
  font-weight: 700;
  text-transform: uppercase;
}

h1 {
  margin: 0 0 16px;
  font-size: 32px;
  line-height: 1.2;
}

p {
  margin: 0;
  font-size: 16px;
  line-height: 1.7;
}
</style>
