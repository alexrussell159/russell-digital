<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Core Services — Russell Digital</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="/css/styles.css" />
  <link rel="icon" href="/assets/russell-digital-favicon.png" type="image/png" />
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800;0,9..40,900;1,9..40,300;1,9..40,400&display=swap" rel="stylesheet">

<style>

      .rd-article-page{
    padding:120px 16px 72px;
    margin-bottom:64px;
    font-family:'DM Sans', Arial, sans-serif;
    background:linear-gradient(180deg,#dfeafb 0%,#f5f8ff 20%,#ffffff 100%);
    color:#0f172a;
  }

  .rd-article-wrap{
    width:100%;
    max-width:1180px;
    margin:0 auto;
  }

  .rd-article-shell{
    max-width:860px;
    margin:0 auto;
  }

  .rd-article-meta{
    display:flex;
    align-items:center;
    gap:10px;
    margin-bottom:14px;
    color:#2563eb;
    font-size:.82rem;
    font-weight:800;
    letter-spacing:.08em;
    text-transform:uppercase;
  }

  .rd-article-dot{
    width:4px;
    height:4px;
    border-radius:999px;
    background:#94a3b8;
  }

  .rd-article-title{
    margin:0 0 16px;
    font-size:clamp(2.3rem,5vw,4.4rem);
    line-height:.95;
    letter-spacing:-.05em;
    font-weight:900;
    text-wrap:balance;
  }

  .rd-article-intro{
    margin:0 0 28px;
    color:#64748b;
    font-size:1.05rem;
    line-height:1.85;
  }

  .rd-article-card{
    padding:34px;
    border:1px solid #dbe5f1;
    border-radius:28px;
    background:rgba(255,255,255,.92);
    box-shadow:0 18px 50px rgba(15,23,42,.08);
  }

  .rd-article-content{
    color:#1e293b;
    font-size:1rem;
    line-height:1.9;
  }

  .rd-article-content > *:first-child{
    margin-top:0;
  }

  .rd-article-content > *:last-child{
    margin-bottom:0;
  }

  .rd-article-content h2{
    margin:34px 0 12px;
    font-size:1.65rem;
    line-height:1.15;
    letter-spacing:-.03em;
    color:#0f172a;
  }

  .rd-article-content h3{
    margin:28px 0 10px;
    font-size:1.18rem;
    line-height:1.2;
    letter-spacing:-.02em;
    color:#0f172a;
  }

  .rd-article-content p{
    margin:0 0 18px;
    color:#475569;
  }

  .rd-article-content ul,
  .rd-article-content ol{
    margin:0 0 22px 0;
    padding-left:22px;
    color:#475569;
  }

  .rd-article-content li{
    margin-bottom:10px;
    padding-left:4px;
  }

  .rd-article-content a{
    color:#2563eb;
    text-decoration:none;
    font-weight:700;
  }

  .rd-article-content a:hover{
    text-decoration:underline;
  }

  .rd-article-content strong{
    color:#0f172a;
  }

  .rd-article-content blockquote{
    margin:26px 0;
    padding:18px 20px;
    border-left:4px solid #2563eb;
    border-radius:0 16px 16px 0;
    background:#f8fbff;
    color:#334155;
  }

  .rd-article-content img{
    display:block;
    width:100%;
    height:auto;
    margin:24px 0;
    border-radius:18px;
    border:1px solid #e6edf7;
    background:#fff;
  }

  .rd-article-cta{
    margin-top:28px;
    padding:24px;
    border:1px solid #dbe5f1;
    border-radius:22px;
    background:linear-gradient(135deg,#f8fbff 0%,#eef5ff 100%);
  }

  .rd-article-cta-label{
    display:inline-flex;
    align-items:center;
    padding:8px 12px;
    border-radius:999px;
    background:rgba(37,99,235,.10);
    color:#2563eb;
    font-size:.78rem;
    font-weight:800;
    letter-spacing:.07em;
    text-transform:uppercase;
    margin-bottom:12px;
  }

  .rd-article-cta h3{
    margin:0 0 8px;
    font-size:1.35rem;
    letter-spacing:-.02em;
  }

  .rd-article-cta p{
    margin:0 0 16px;
    color:#64748b;
    line-height:1.75;
  }

  .rd-article-btn{
    display:inline-flex;
    align-items:center;
    justify-content:center;
    min-height:50px;
    padding:0 18px;
    border-radius:14px;
    background:linear-gradient(135deg,#2563eb 0%,#1d4ed8 100%);
    color:#fff;
    text-decoration:none;
    font-size:.95rem;
    font-weight:800;
    box-shadow:0 14px 30px rgba(37,99,235,.24);
  }

  @media (max-width: 767px){
    .rd-article-page{
      padding:104px 12px 56px;
    }

    .rd-article-card{
      padding:22px;
      border-radius:22px;
    }

    .rd-article-title{
      font-size:clamp(2rem,10vw,3.3rem);
    }

    .rd-article-intro,
    .rd-article-content{
      font-size:.98rem;
      line-height:1.78;
    }

    .rd-article-content h2{
      font-size:1.4rem;
    }
  }

</style>
</head>

<body>
    <div id="rd-header"></div>

    <section class="rd-article-page">
  <div class="rd-article-wrap">
    <div class="rd-article-shell">

 <!-- ARTICLE DATE -->
      <div class="rd-article-meta">
        <span>March 16, 2026</span>
      </div>

<!-- PAGE TITLE -->
      <h1 class="rd-article-title">ECTN Online Application Process</h1>

<!-- THIS IS WHERE THE POST CONTENT BEGINS -->
<article class="rd-article-card">
        <div class="rd-article-content">


        </div>
      </article>
<!-- THIS IS WHERE THE POST CONTENT ENDS -->

    </div>
  </div>
</section>

    <div id="rd-footer"></div>
<script src="/js/loadComponents.js" defer></script>
</body>
</html>