import LegalPage from './LegalPage'

export default function Terms() {
  return (
    <LegalPage title="用户服务协议" lastUpdated="2026 年 7 月 13 日">
      <p style={{ marginBottom: '24px' }}>
        欢迎使用 Xcomputer（以下简称"本应用"）。本协议是您与本应用开发者（以下简称"我们"）之间就使用本应用所订立的具有法律效力的协议。请您在使用本应用前，仔细阅读并充分理解本协议全部内容。您下载、安装、使用本应用即视为您已同意接受本协议的全部条款。
      </p>

      <h2 style={sectionTitle}>一、服务描述</h2>
      <p style={{ marginBottom: '24px' }}>
        本应用是一款基于人工智能技术的 Windows 桌面自动化助手，支持通过自然语言指令操控电脑、执行系统任务、查看任务进度等功能。本应用为开源软件，您可从官方渠道免费获取。
      </p>

      <h2 style={sectionTitle}>二、使用许可</h2>
      <p style={{ marginBottom: '12px' }}>
        我们授予您一项个人的、非独占的、不可转让的许可，以安装和使用本应用。您应当遵守以下限制：
      </p>
      <ul style={{ paddingLeft: '20px', marginBottom: '24px' }}>
        <li style={{ marginBottom: '8px' }}>不得对本应用进行逆向工程、反编译或反汇编，法律法规明确允许的除外。</li>
        <li style={{ marginBottom: '8px' }}>不得复制、修改、分发本应用的源代码用于商业用途，除非符合开源协议的约定。</li>
        <li style={{ marginBottom: '8px' }}>不得删除或篡改本应用中的版权、商标等知识产权标识。</li>
      </ul>

      <h2 style={sectionTitle}>三、用户责任</h2>
      <p style={{ marginBottom: '12px' }}>您在使用本应用时应遵守中华人民共和国相关法律法规，并承诺：</p>
      <ul style={{ paddingLeft: '20px', marginBottom: '24px' }}>
        <li style={{ marginBottom: '8px' }}>不得利用本应用从事任何违法违规活动，包括但不限于侵犯他人合法权益、危害网络安全、传播恶意程序等。</li>
        <li style={{ marginBottom: '8px' }}>对您通过本应用发出的所有指令及由此产生的后果承担全部责任。</li>
        <li style={{ marginBottom: '8px' }}>妥善保管您的 API 密钥与设备，因保管不善导致的损失由您自行承担。</li>
        <li style={{ marginBottom: '8px' }}>在使用高风险操作（文件删除、注册表修改、进程管理等）时，应审慎确认操作内容。</li>
      </ul>

      <h2 style={sectionTitle}>四、知识产权</h2>
      <p style={{ marginBottom: '24px' }}>
        本应用及其所有组成部分（包括但不限于源代码、界面设计、图标、文档）的知识产权归我们或相关权利人所有。本应用以开源协议发布，具体许可条款请参阅项目仓库中的 LICENSE 文件。
      </p>

      <h2 style={sectionTitle}>五、免责声明</h2>
      <p style={{ marginBottom: '12px' }}>在法律允许的范围内，我们对以下情形不承担任何责任：</p>
      <ul style={{ paddingLeft: '20px', marginBottom: '24px' }}>
        <li style={{ marginBottom: '8px' }}>因 AI 服务不可用、响应错误或延迟导致的直接或间接损失。</li>
        <li style={{ marginBottom: '8px' }}>因您误操作（如误删文件、修改系统配置）导致的设备故障或数据丢失。</li>
        <li style={{ marginBottom: '8px' }}>因第三方服务（如 AI 服务提供商）故障或政策变更导致的功能受限。</li>
        <li style={{ marginBottom: '8px' }}>因不可抗力（自然灾害、网络中断、电力故障等）导致的服务中断。</li>
      </ul>

      <h2 style={sectionTitle}>六、责任限制</h2>
      <p style={{ marginBottom: '24px' }}>
        在法律允许的最大范围内，无论何种情形，我们对您因使用本应用而产生的任何直接、间接、附带、衍生或惩罚性损害赔偿，累计责任总额不超过您实际向本应用支付的费用（鉴于本应用为免费软件，该费用为零）。
      </p>

      <h2 style={sectionTitle}>七、服务变更与终止</h2>
      <p style={{ marginBottom: '24px' }}>
        我们保留随时修改、暂停或终止本应用（或其任何部分）的权利，且无需事先通知您。您可随时停止使用本应用并卸载以终止本协议。本协议中关于免责声明、责任限制、知识产权等条款在协议终止后继续有效。
      </p>

      <h2 style={sectionTitle}>八、争议解决</h2>
      <p style={{ marginBottom: '24px' }}>
        本协议的订立、效力、解释、履行及争议解决均适用中华人民共和国法律。因本协议或使用本应用产生的任何争议，双方应首先友好协商解决；协商不成的，任何一方均可向我们所在地有管辖权的人民法院提起诉讼。
      </p>

      <h2 style={sectionTitle}>九、协议变更</h2>
      <p style={{ marginBottom: '24px' }}>
        我们可能根据业务发展或法律法规变化修订本协议。修订后的协议将在本页面公布，自公布之日起生效。如您不同意修订内容，请停止使用本应用；继续使用则视为您接受修订后的协议。
      </p>

      <h2 style={sectionTitle}>十、联系我们</h2>
      <p>
        如对本协议有任何疑问或建议，请通过下方联系方式与我们沟通。
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
