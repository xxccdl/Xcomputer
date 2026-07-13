import LegalPage from './LegalPage'

export default function Privacy() {
  return (
    <LegalPage title="隐私政策" lastUpdated="2026 年 7 月 13 日">
      <p style={{ marginBottom: '24px' }}>
        Xcomputer（以下简称"本应用"）是一款基于 AI 的 Windows 桌面自动化助手。我们深知个人信息对您的重要性，本政策旨在向您说明我们如何收集、使用、存储和保护您的信息。请您在使用本应用前，仔细阅读并充分理解本政策的全部内容。
      </p>

      <h2 style={sectionTitle}>一、我们收集的信息</h2>
      <p style={{ marginBottom: '12px' }}>
        本应用采用<strong style={{ color: 'var(--text)' }}>本地优先</strong>的设计原则，绝大部分数据存储与处理均在您的设备本地完成。我们仅收集以下必要信息：
      </p>
      <ul style={{ paddingLeft: '20px', marginBottom: '24px' }}>
        <li style={{ marginBottom: '8px' }}>
          <strong style={{ color: 'var(--text)' }}>API 密钥：</strong>您配置的 AI 服务提供商（如 DeepSeek）API 密钥，仅保存在本地配置文件中，不会上传至任何第三方服务器。
        </li>
        <li style={{ marginBottom: '8px' }}>
          <strong style={{ color: 'var(--text)' }}>对话历史：</strong>您与 AI 的对话记录默认存储于本地数据库，您可以随时删除。
        </li>
        <li style={{ marginBottom: '8px' }}>
          <strong style={{ color: 'var(--text)' }}>操作指令与执行结果：</strong>当您使用自然语言操控电脑时，指令内容与执行结果（含截图、文件路径等）会保存在本地，以便您查阅历史记录。
        </li>
      </ul>

      <h2 style={sectionTitle}>二、信息的使用</h2>
      <p style={{ marginBottom: '24px' }}>
        我们收集的信息仅用于以下目的：提供桌面自动化服务、维护对话历史、改进用户体验、排查应用故障。我们不会将您的个人信息用于定向广告、用户画像分析，也不会出售给任何第三方。
      </p>

      <h2 style={sectionTitle}>三、AI 处理与第三方服务</h2>
      <p style={{ marginBottom: '12px' }}>
        本应用依赖第三方 AI 服务（如 DeepSeek）理解您的自然语言指令。当您发送指令时，相关文本内容会通过加密连接传输至 AI 服务提供商进行处理。请注意：
      </p>
      <ul style={{ paddingLeft: '20px', marginBottom: '24px' }}>
        <li style={{ marginBottom: '8px' }}>传输至 AI 服务的内容仅限完成指令所必需的文本信息。</li>
        <li style={{ marginBottom: '8px' }}>AI 服务提供商对其收到的数据享有独立的处理权，请参阅其隐私政策。</li>
        <li style={{ marginBottom: '8px' }}>截图、文件内容等敏感信息默认不会自动上传，仅在您明确授权时才会发送。</li>
      </ul>

      <h2 style={sectionTitle}>四、截图与文件访问</h2>
      <p style={{ marginBottom: '24px' }}>
        为实现桌面自动化功能，本应用在您授权后可以截取屏幕画面、访问指定文件、执行系统操作。所有截图与文件内容默认存储于本地，不会自动上传。涉及高风险操作（如文件删除、注册表修改、进程管理等）时，本应用会请求您逐次确认。
      </p>

      <h2 style={sectionTitle}>五、数据安全</h2>
      <p style={{ marginBottom: '24px' }}>
        我们采取合理的技术与管理措施保护您的信息安全，包括本地数据加密存储、API 密钥安全保管、传输加密等。但请注意，互联网环境并非绝对安全，我们无法保证信息不受任何形式的泄露。建议您妥善保管设备与 API 密钥。
      </p>

      <h2 style={sectionTitle}>六、您的权利</h2>
      <p style={{ marginBottom: '12px' }}>您对个人信息享有以下权利：</p>
      <ul style={{ paddingLeft: '20px', marginBottom: '24px' }}>
        <li style={{ marginBottom: '8px' }}><strong style={{ color: 'var(--text)' }}>查阅与复制权：</strong>您可在应用内随时查看对话历史与本地配置。</li>
        <li style={{ marginBottom: '8px' }}><strong style={{ color: 'var(--text)' }}>删除权：</strong>您可删除单条对话或清空全部历史记录。</li>
        <li style={{ marginBottom: '8px' }}><strong style={{ color: 'var(--text)' }}>卸载清除权：</strong>卸载本应用后，本地数据目录可手动删除以彻底清除。</li>
        <li style={{ marginBottom: '8px' }}><strong style={{ color: 'var(--text)' }}>撤回授权权：</strong>您可随时在系统设置中撤销截图、文件访问等权限。</li>
      </ul>

      <h2 style={sectionTitle}>七、儿童隐私</h2>
      <p style={{ marginBottom: '24px' }}>
        本应用面向具备完全民事行为能力的用户。若您是未满 14 周岁的未成年人，请在监护人指导下使用，并确保已获得监护人同意。
      </p>

      <h2 style={sectionTitle}>八、政策变更</h2>
      <p style={{ marginBottom: '24px' }}>
        本政策可能因业务调整或法律法规变化而更新。重大变更时，我们将在应用内或本页面显著位置通知您。继续使用本应用即视为您同意更新后的政策。
      </p>

      <h2 style={sectionTitle}>九、联系我们</h2>
      <p>
        如对本政策有任何疑问、建议或投诉，请通过下方联系方式与我们沟通，我们将在合理期限内回复。
      </p>
    </LegalPage>
  )
}

const sectionTitle: React.CSSProperties = {
  fontSize: '20px',
  fontWeight: 600,
  color: 'var(--text)',
  marginBottom: '16px',
  marginTop: '40px',
  paddingBottom: '8px',
  borderBottom: '1px solid var(--border)',
}
