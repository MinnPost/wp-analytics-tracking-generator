<?php
/**
 * Class file for the WP_Analytics_Tracking_Generator_Admin class.
 *
 * @file
 */

if ( ! class_exists( 'WP_Analytics_Tracking_Generator' ) ) {
	die();
}

/**
 * Create default WordPress admin functionality to configure the plugin.
 */
class WP_Analytics_Tracking_Generator_Admin {

	protected $option_prefix;
	protected $version;
	protected $slug;
	//protected $cache;

	/**
	* Constructor which sets up admin pages
	*
	* @param string $option_prefix
	* @param string $version
	* @param string $slug
	* @param object $cache
	* @throws \Exception
	*/
	public function __construct( $option_prefix, $version, $slug ) {

		$this->option_prefix = $option_prefix;
		$this->version       = $version;
		$this->slug          = $slug;
		//$this->cache         = $cache;

		//$this->mp_mem_transients = $this->cache->mp_mem_transients;

		$this->tabs = $this->get_admin_tabs();

		$this->default_tab = 'basic_settings';

		$this->add_actions();

	}

	/**
	* Create the action hooks to create the admin page(s)
	*
	*/
	public function add_actions() {
		if ( is_admin() ) {
			add_action( 'admin_menu', array( $this, 'create_admin_menu' ) );
			add_action( 'admin_init', array( $this, 'admin_settings_form' ) );
			//add_action( 'admin_enqueue_scripts', array( $this, 'admin_scripts_and_styles' ) );
		}

	}

	/**
	* Create WordPress admin options page
	*
	*/
	public function create_admin_menu() {
		$title = __( 'Analytics Tracking', 'wp-analytics-tracking-generator' );
		add_options_page( $title, $title, 'manage_options', $this->slug . '-admin', array( $this, 'show_admin_page' ) );
	}


	/**
	* Create WordPress admin options page tabs
	*
	* @return array $tabs
	*
	*/
	private function get_admin_tabs() {
		$tabs = array(
			'basic_settings'     => 'Basic Settings',
			'custom_definitions' => 'Custom Definitions',
		); // this creates the tabs for the admin
		return $tabs;
	}

	/**
	* Display the admin settings page
	*
	* @return void
	*/
	public function show_admin_page() {
		$get_data = filter_input_array( INPUT_GET, FILTER_SANITIZE_STRING );
		?>
		<div class="wrap">
			<h1><?php _e( get_admin_page_title() , 'wp-analytics-tracking-generator' ); ?></h1>

			<?php
			$tabs = $this->tabs;
			$tab  = isset( $get_data['tab'] ) ? sanitize_key( $get_data['tab'] ) : $this->default_tab;
			$this->render_tabs( $tabs, $tab );

			switch ( $tab ) {
				default:
					require_once( plugin_dir_path( __FILE__ ) . '/../templates/admin/settings.php' );
					break;
			} // End switch().
			?>
		</div>
		<?php
	}

	/**
	* Render tabs for settings pages in admin
	* @param array $tabs
	* @param string $tab
	*/
	private function render_tabs( $tabs, $tab = '' ) {

		$get_data = filter_input_array( INPUT_GET, FILTER_SANITIZE_STRING );

		$current_tab = $tab;
		echo '<h2 class="nav-tab-wrapper">';
		foreach ( $tabs as $tab_key => $tab_caption ) {
			$active = $current_tab === $tab_key ? ' nav-tab-active' : '';
			echo sprintf( '<a class="nav-tab%1$s" href="%2$s">%3$s</a>',
				esc_attr( $active ),
				esc_url( '?page=' . $this->slug . '-admin&tab=' . $tab_key ),
				esc_html( $tab_caption )
			);
		}
		echo '</h2>';

		if ( isset( $get_data['tab'] ) ) {
			$tab = sanitize_key( $get_data['tab'] );
		} else {
			$tab = '';
		}
	}

	/**
	* Register items for the settings api
	* @return void
	*
	*/
	public function admin_settings_form() {

		$get_data = filter_input_array( INPUT_GET, FILTER_SANITIZE_STRING );
		$page     = isset( $get_data['tab'] ) ? sanitize_key( $get_data['tab'] ) : $this->default_tab;
		$section  = isset( $get_data['tab'] ) ? sanitize_key( $get_data['tab'] ) : $this->default_tab;

		require_once( plugin_dir_path( __FILE__ ) . '/../settings-functions.inc.php' );

		$all_field_callbacks = array(
			'text'       => 'display_input_field',
			'checkboxes' => 'display_checkboxes',
			'select'     => 'display_select',
			'link'       => 'display_link',
		);

		$this->basic_settings( 'basic_settings', 'basic_settings', $all_field_callbacks );

	}

	/**
	* Fields for the Basic Settings tab
	* This runs add_settings_section once, as well as add_settings_field and register_setting methods for each option
	*
	* @param string $page
	* @param string $section
	* @param array $callbacks
	*/
	private function basic_settings( $page, $section, $callbacks ) {
		$tabs = $this->tabs;
		foreach ( $tabs as $key => $value ) {
			if ( $key === $page ) {
				$title = $value;
			}
		}
		add_settings_section( $page, $title, null, $page );

		$settings = array(
			'tracking_code_type' => array(
				'title'    => __( 'Tracking Code Type', 'wp-analytics-tracking-generator' ),
				'callback' => $callbacks['select'],
				'page'     => $page,
				'section'  => $section,
				'args'     => array(
					'type'     => 'select',
					'desc'     => '',
					'constant' => '',
					'items'    => array(
						'gtagjs'      => array(
							'value' => 'gtagjs',
							'text'  => 'gtag.js',
						),
						'analyticsjs' => array(
							'value' => 'analyticsjs',
							'text'  => 'analytics.js',
						),
					),
				),
			),
			'property_id'        => array(
				'title'    => __( 'Tracking ID', 'wp-analytics-tracking-generator' ),
				'callback' => $callbacks['text'],
				'page'     => $page,
				'section'  => $section,
				'args'     => array(
					'type'     => 'text',
					'desc'     => '',
					'constant' => 'WP_ANALYTICS_TRACKING_ID',
				),
			),
			'disable_pageview'   => array(
				'title'    => __( 'Disable pageview tracking?', 'wp-analytics-tracking-generator' ),
				'callback' => $callbacks['text'],
				'page'     => $page,
				'section'  => $section,
				'args'     => array(
					'type' => 'checkbox',
					'desc' => 'If you check this, the tracker will not send a pageview hit to Analytics',
				),
			),
			'disable_for_roles'  => array(
				'title'    => __( 'Disable Analytics for these roles', 'wp-analytics-tracking-generator' ),
				'callback' => $callbacks['checkboxes'],
				'page'     => $page,
				'section'  => $section,
				'args'     => array(
					'type'     => 'checkboxes',
					'desc'     => 'Analytics code will not be run for these roles',
					'constant' => '',
					'items'    => $this->get_role_options(),
				),
			),

		);

		foreach ( $settings as $key => $attributes ) {
			$id       = $this->option_prefix . $key;
			$name     = $this->option_prefix . $key;
			$title    = $attributes['title'];
			$callback = $attributes['callback'];
			$page     = $attributes['page'];
			$section  = $attributes['section'];
			$args     = array_merge(
				$attributes['args'],
				array(
					'title'     => $title,
					'id'        => $id,
					'label_for' => $id,
					'name'      => $name,
				)
			);

			// if there is a constant and it is defined, don't run a validate function if there is one
			if ( isset( $attributes['args']['constant'] ) && defined( $attributes['args']['constant'] ) ) {
				$validate = '';
			}

			add_settings_field( $id, $title, $callback, $page, $section, $args );
			register_setting( $section, $id );
		}
	}

	/**
	* WordPress user roles as setting field options
	*
	* @return array $items
	*/
	private function get_role_options() {
		$items = array();
		$roles = get_editable_roles();
		foreach ( $roles as $key => $role ) {
			$items[] = array(
				'id'    => $key,
				'value' => $key,
				'text'  => $role['name'],
				'desc'  => '',
			);
		}
		return $items;
	}

}
