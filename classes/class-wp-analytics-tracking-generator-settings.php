<?php
/**
 * Class file for the WP_Analytics_Tracking_Generator_Settings class.
 *
 * @file
 */

if ( ! class_exists( 'WP_Analytics_Tracking_Generator' ) ) {
	die();
}

/**
 * Store some settings that are not exposed in the interface
 */
class WP_Analytics_Tracking_Generator_Settings {

	protected $option_prefix;
	protected $version;
	protected $slug;

	/**
	* Constructor which sets up admin pages
	*
	* @param string $option_prefix
	* @param string $version
	* @param string $slug
	* @throws \Exception
	*/
	public function __construct( $option_prefix, $version, $slug ) {

		$this->option_prefix = $option_prefix;
		$this->version       = $version;
		$this->slug          = $slug;

		$this->dimension_count_default = 20;

		$this->add_actions();

	}

	/**
	* Create any action hooks
	*
	*/
	public function add_actions() {

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
	* Fields for the Custom Dimensions tab
	* This runs add_settings_section once, as well as add_settings_field and register_setting methods for each option
	*
	* @param string $page
	* @param string $section
	* @param array $callbacks
	*/
	private function custom_dimensions( $page, $section, $callbacks ) {
		$tabs = $this->tabs;
		foreach ( $tabs as $key => $value ) {
			if ( $key === $page ) {
				$title = $value;
			}
		}
		add_settings_section( $page, $title, null, $page );

		$settings['dimension_total_count'] = array(
			'title'    => __( 'Available Dimensions', 'wp-analytics-tracking-generator' ),
			'callback' => $callbacks['text'],
			'page'     => $page,
			'section'  => $section,
			'args'     => array(
				'type'     => 'text',
				'desc'     => 'Total count of dimensions in Analytics. Default will be 20, if this is empty.',
				'constant' => '',
			),
		);

		$i               = 1;
		$dimension_count = get_option( $this->option_prefix . 'dimension_total_count', 20 );
		if ( '' === $dimension_count ) {
			$dimension_count = 20;
		}
		while ( $i <= $dimension_count ) {
			if ( 1 === $i ) {
				$desc = __( 'Enter a global WordPress variable for each dimension you have in Analytics. You can also use the wp_analytics_tracking_generator_add_dimension hook.', 'wp-analytics-tracking-generator' );
			} else {
				$desc = '';
			}
			$settings[ 'dimension_' . $i ] = array(
				'title'    => __( 'Dimension ', 'wp-analytics-tracking-generator' ) . $i,
				'callback' => $callbacks['text'],
				'page'     => $page,
				'section'  => $section,
				'args'     => array(
					'type'     => 'text',
					'desc'     => $desc,
					'constant' => '',
				),
			);
			$i++;
		}

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
